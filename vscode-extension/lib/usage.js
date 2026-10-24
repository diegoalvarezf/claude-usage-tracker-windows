/**
 * usage.js — Lectura y agregación del historial de Claude Code.
 *
 * Claude Code guarda cada sesión en <config>/projects/<ruta-codificada>/<sesión>.jsonl
 * y los subagentes en <sesión>/subagents/*.jsonl. Cada respuesta de la API puede aparecer
 * varias veces (una línea por bloque de contenido), así que se deduplica por message.id + requestId.
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { resolveModel, costOfUsage, cacheSavingsOfUsage, splitCacheWrite, WEB_SEARCH_PER_REQUEST } = require('./pricing');
const PROVIDERS = [require('./providers/codex'), require('./providers/gemini')];

/** Carpetas de proyectos posibles (CLAUDE_CONFIG_DIR admite varias separadas por coma). */
function findProjectDirs() {
  const bases = [];
  if (process.env.CLAUDE_CONFIG_DIR) {
    for (const d of process.env.CLAUDE_CONFIG_DIR.split(',')) if (d.trim()) bases.push(d.trim());
  }
  bases.push(path.join(os.homedir(), '.claude'));
  bases.push(path.join(os.homedir(), '.config', 'claude'));
  const seen = new Set();
  return bases
    .map(b => path.join(b, 'projects'))
    .filter(d => {
      const r = path.resolve(d);
      if (seen.has(r)) return false;
      seen.add(r);
      try { return fs.statSync(d).isDirectory(); } catch { return false; }
    });
}

function walkJsonl(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkJsonl(full, out);
    else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(full);
  }
  return out;
}

// Claude Code codifica la ruta sustituyendo todo lo no alfanumérico por '-'
const encodePath = p => p.replace(/[^a-zA-Z0-9]/g, '-');

/** Nombre legible a partir del nombre de carpeta, cuando no hay cwd que lo confirme. */
function fallbackProjectName(folder) {
  const parts = folder.split(/-(?:repos|repositorios|projects|proyectos|code|src|dev|Desktop|Documents)-/i);
  const last  = parts.length > 1 ? parts[parts.length - 1] : folder.replace(/^[A-Za-z]--Users-[^-]+-|^-Users-[^-]+-|^-home-[^-]+-/, '');
  return last || folder;
}

const localDay   = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const localMonth = d => localDay(d).slice(0, 7);

function emptyTok() { return { input: 0, cacheWrite: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, output: 0 }; }
function addTok(t, u) {
  const { w5m, w1h } = splitCacheWrite(u);
  t.input        += u.input_tokens            || 0;
  t.cacheWrite   += w5m + w1h;
  t.cacheWrite5m += w5m;
  t.cacheWrite1h += w1h;
  t.cacheRead    += u.cache_read_input_tokens || 0;
  t.output       += u.output_tokens           || 0;
}

/**
 * Convierte una línea del log en cargos por modelo.
 * Con fallback (usage.iterations con varios modelos) cada iteración se factura con su modelo;
 * el usage de primer nivel solo refleja la última.
 */
function chargesOf(entry) {
  const msg   = entry.message || {};
  const usage = msg.usage;
  const opts  = { speed: usage.speed, inferenceGeo: usage.inference_geo, ts: entry.timestamp };
  const its   = Array.isArray(usage.iterations) && usage.iterations.length ? usage.iterations : null;
  const parts = its
    ? its.map(it => ({ model: it.model || msg.model, usage: it }))
    : [{ model: msg.model, usage }];

  const charges = parts
    .filter(c => c.model && c.model !== '<synthetic>')
    .map(c => ({
      model:   c.model,
      usage:   c.usage,
      cost:    costOfUsage(c.usage, c.model, opts),
      savings: cacheSavingsOfUsage(c.usage, c.model),
    }));

  const searches = (usage.server_tool_use && usage.server_tool_use.web_search_requests) || 0;
  if (searches && charges.length) charges[charges.length - 1].cost += searches * WEB_SEARCH_PER_REQUEST;
  return { charges, searches, fast: usage.speed === 'fast' };
}

function collectToolUses(entry, sessionId, seenBlocks, out) {
  const content = entry.message.content;
  if (!Array.isArray(content)) return;
  for (const b of content) {
    if (!b || b.type !== 'tool_use' || !b.name) continue;
    if (b.id) { if (seenBlocks.has(b.id)) continue; seenBlocks.add(b.id); }
    out.push({ name: b.name, input: b.input || {}, sessionId, model: entry.message.model, ts: entry.timestamp });
  }
}

/** Nº de páginas de un parámetro `pages` ("1-10", "3", "1-3,7") o null si no se indicó. */
function countPages(pages) {
  if (!pages) return null;
  let n = 0;
  for (const part of String(pages).split(',')) {
    const [a, b] = part.split('-').map(x => parseInt(x, 10));
    if (!isNaN(a)) n += !isNaN(b) && b >= a ? b - a + 1 : 1;
  }
  return n || null;
}

function recordSignal(signals, t, project) {
  const { name, input } = t;
  if (name === 'Read' && /\.pdf$/i.test(String(input.file_path || ''))) {
    signals.pdfReads.push({ project, file: input.file_path, pages: countPages(input.pages), model: t.model, ts: t.ts });
  } else if ((name === 'Edit' || name === 'Write' || name === 'MultiEdit' || name === 'NotebookEdit') && (input.file_path || input.notebook_path)) {
    if (!signals.sessions[t.sessionId]) signals.sessions[t.sessionId] = { project, editedFiles: new Set(), requests: 0, cost: 0 };
    signals.sessions[t.sessionId].editedFiles.add(input.file_path || input.notebook_path);
  } else if (name === 'Skill' && input.skill) {
    signals.skills[input.skill] = (signals.skills[input.skill] || 0) + 1;
  } else if (name.startsWith('mcp__')) {
    const server = name.split('__')[1];
    signals.mcpServers[server] = (signals.mcpServers[server] || 0) + 1;
  }
}

/**
 * Lee todos los logs y devuelve los datos agregados.
 */
function loadUsage({ now = new Date() } = {}) {
  const projectDirs = findProjectDirs();
  const today       = localDay(now);
  const thisMonth   = localMonth(now);

  const seen       = new Set();
  const byMonth    = {};   // mes → proyecto → { cost, tokens, models: { modelo: coste } }
  const byProject  = {};   // proyecto → { cost, tokens, sessions:Set, lastUsed, models }
  const byModel    = {};   // modelo → { cost, ...tokens, requests, estimated }
  const byDay      = {};   // yyyy-mm-dd → coste
  const byMonthModel = {}; // mes → modelo → { cost, ...tokens }
  const byProvider = {};   // anthropic | openai | google → { cost, requests }
  const sources    = [];   // { id, label, files }
  const unknownModels = new Set();
  const totals     = { cost: 0, savings: 0, requests: 0, duplicates: 0, webSearches: 0, fastRequests: 0, tok: emptyTok() };
  const todayTot   = { cost: 0, requests: 0, tok: emptyTok() };
  let firstTs = null, lastTs = null, files = 0;
  const projectNames = new Set();

  // Señales para los consejos (lib/insights.js). Se leen de TODAS las líneas, antes de deduplicar:
  // cada línea repetida trae un bloque de contenido distinto de la misma respuesta.
  const signals = {
    pdfReads:   [],                 // { project, file, pages, model, ts }
    sessions:   {},                 // sesión → { project, editedFiles:Set, requests, cost }
    skills:     {},                 // skill → usos
    mcpServers: {},                 // servidor → usos
    projectCwd: {},                 // proyecto → cwd
  };
  const seenBlocks = new Set();

  /** Suma una petición (con uno o varios cargos) a todos los agregados. */
  function ingest({ charges, searches = 0, fast = false, ts, sessionId, projectName, provider }) {
    const day   = localDay(ts);
    const month = localMonth(ts);
    if (!firstTs || ts < firstTs) firstTs = ts;
    if (!lastTs  || ts > lastTs)  lastTs  = ts;

    totals.requests++;
    totals.webSearches += searches;
    if (fast) totals.fastRequests++;
    if (day === today) todayTot.requests++;

    if (!signals.sessions[sessionId]) signals.sessions[sessionId] = { project: projectName, editedFiles: new Set(), requests: 0, cost: 0 };
    const ss = signals.sessions[sessionId];
    ss.requests++;
    ss.cost += charges.reduce((s, c) => s + c.cost, 0);

    if (!byProject[projectName]) byProject[projectName] = { cost: 0, tokens: 0, requests: 0, sessions: new Set(), lastUsed: null, models: {} };
    const bp = byProject[projectName];
    bp.requests++;
    bp.sessions.add(sessionId);
    if (!bp.lastUsed || ts > bp.lastUsed) bp.lastUsed = ts;

    if (!byMonth[month]) byMonth[month] = {};
    if (!byMonth[month][projectName]) byMonth[month][projectName] = { cost: 0, tokens: 0, models: {} };
    const bm = byMonth[month][projectName];

    for (const c of charges) {
      const u   = c.usage;
      const tok = (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
      const { key, estimated } = resolveModel(c.model);
      if (estimated) unknownModels.add(c.model);

      totals.cost    += c.cost;
      totals.savings += c.savings;
      addTok(totals.tok, u);
      if (day === today) { todayTot.cost += c.cost; addTok(todayTot.tok, u); }
      byDay[day] = (byDay[day] || 0) + c.cost;

      bm.cost   += c.cost;
      bm.tokens += tok;
      bm.models[c.model] = (bm.models[c.model] || 0) + c.cost;

      bp.cost   += c.cost;
      bp.tokens += tok;
      bp.models[c.model] = (bp.models[c.model] || 0) + c.cost;

      if (!byMonthModel[month]) byMonthModel[month] = {};
      if (!byMonthModel[month][c.model]) byMonthModel[month][c.model] = { cost: 0, ...emptyTok() };
      byMonthModel[month][c.model].cost += c.cost;
      addTok(byMonthModel[month][c.model], u);

      if (!byModel[c.model]) byModel[c.model] = { cost: 0, requests: 0, key, estimated, ...emptyTok() };
      const bmod = byModel[c.model];
      bmod.cost += c.cost;
      bmod.requests++;
      addTok(bmod, u);
    }
    byProvider[provider] = byProvider[provider] || { cost: 0, requests: 0 };
    byProvider[provider].requests++;
    byProvider[provider].cost += charges.reduce((s, c) => s + c.cost, 0);
  }

  for (const root of projectDirs) {
    let folders;
    try { folders = fs.readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); }
    catch { continue; }

    for (const folder of folders) {
      const jsonlFiles = walkJsonl(path.join(root, folder));
      if (!jsonlFiles.length) continue;
      let projectName = null;
      const pending  = [];
      const toolUses = [];

      for (const file of jsonlFiles) {
        let text;
        try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
        files++;
        const sessionId = path.basename(file.includes(`${path.sep}subagents${path.sep}`) ? path.dirname(path.dirname(file)) : file, '.jsonl');

        for (const line of text.split('\n')) {
          if (!line || line.indexOf('"usage"') === -1) {
            // Aun sin uso, la línea puede decirnos el cwd real del proyecto
            if (!projectName && line.indexOf('"cwd"') !== -1) {
              try { const e = JSON.parse(line); if (e.cwd && encodePath(e.cwd) === folder) projectName = path.basename(e.cwd); } catch { }
            }
            continue;
          }
          let entry;
          try { entry = JSON.parse(line); } catch { continue; }
          if (!projectName && entry.cwd && encodePath(entry.cwd) === folder) projectName = path.basename(entry.cwd);
          if (entry.type !== 'assistant' || !entry.message || !entry.message.usage) continue;
          if (entry.message.model === '<synthetic>') continue;
          collectToolUses(entry, sessionId, seenBlocks, toolUses);

          const id = entry.message.id && entry.requestId ? `${entry.message.id}:${entry.requestId}` : (entry.message.id || entry.uuid);
          if (id) {
            if (seen.has(id)) { totals.duplicates++; continue; }
            seen.add(id);
          }
          const ts = entry.timestamp ? new Date(entry.timestamp) : null;
          if (!ts || isNaN(ts)) continue;
          pending.push({ entry, ts, sessionId });
        }
      }

      projectName = projectName || fallbackProjectName(folder);
      // Dos carpetas pueden acabar en el mismo nombre (p.ej. repos distintos llamados "web")
      projectNames.add(projectName);
      if (!signals.projectCwd[projectName]) {
        const withCwd = pending.find(x => x.entry.cwd && encodePath(x.entry.cwd) === folder);
        if (withCwd) signals.projectCwd[projectName] = withCwd.entry.cwd;
      }
      for (const t of toolUses) recordSignal(signals, t, projectName);

      for (const { entry, ts, sessionId } of pending) {
        const { charges, searches, fast } = chargesOf(entry);
        if (charges.length) ingest({ charges, searches, fast, ts, sessionId, projectName, provider: 'anthropic' });
      }
    }
  }
  if (files) sources.push({ id: 'claude', label: 'Claude Code', files });

  // ── Otros proveedores (Codex CLI, Gemini CLI) ───────────────────────────────
  for (const prov of PROVIDERS) {
    let res;
    try { res = prov.load(); } catch { continue; }
    if (!res.files) continue;
    sources.push({ id: prov.id, label: prov.label, files: res.files });
    files += res.files;
    for (const r of res.records) {
      const cost = costOfUsage(r.usage, r.model, { ts: r.ts.toISOString() });
      const charges = [{ model: r.model, usage: r.usage, cost, savings: cacheSavingsOfUsage(r.usage, r.model) }];
      ingest({ charges, ts: r.ts, sessionId: r.sessionId, projectName: r.project, provider: resolveModel(r.model).pricing.provider });
      if (r.cwd && !signals.projectCwd[r.project]) signals.projectCwd[r.project] = r.cwd;
    }
  }

  const monthCost = byMonth[thisMonth] ? Object.values(byMonth[thisMonth]).reduce((s, x) => s + x.cost, 0) : 0;
  for (const p of Object.values(byProject)) p.sessions = p.sessions.size;

  return {
    generatedAt: now,
    projectDirs,
    files,
    today, thisMonth,
    totals, todayTot, monthCost,
    byMonth, byProject, byModel, byDay, byMonthModel, byProvider, sources,
    unknownModels: [...unknownModels],
    firstTs, lastTs,
    signals,
  };
}

module.exports = { loadUsage, findProjectDirs, localDay, localMonth, chargesOf };
