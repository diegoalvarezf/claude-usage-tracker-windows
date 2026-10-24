/**
 * gemini.js — Uso de Google Gemini CLI.
 *
 * Logs: ($GEMINI_CLI_HOME o ~)/.gemini/tmp/<proyecto>/chats/session-*.jsonl  (+ subagentes en chats/<sesión>/)
 * Formato verificado contra google-gemini/gemini-cli @cd1b45c2 (2026-10-23).
 *
 * Cada mensaje se reescribe entero cada vez que cambia (tokens, tool calls...): se deduplica por `id`
 * y gana la última versión. Los tokens son POR RESPUESTA (no acumulados).
 * `cached` está INCLUIDO en `input`; `thoughts` NO está en `output` pero se cobra como salida.
 * Nota: las llamadas auxiliares de la CLI (router, resúmenes) no se registran → el total queda algo por debajo.
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const id    = 'gemini';
const label = 'Gemini CLI';

function runtimeDirs() {
  const home = process.env.GEMINI_CLI_HOME && process.env.GEMINI_CLI_HOME.trim() ? process.env.GEMINI_CLI_HOME : os.homedir();
  return [path.join(home, '.gemini'), path.join(home, '.cache', '.gemini')];
}

function walk(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith('.jsonl') || /^session-.*\.json$/.test(e.name)) out.push(full);
  }
  return out;
}

/** Ruta real del proyecto: tmp/<slug>/.project_root o projects.json; si no, el propio slug. */
function projectRoot(runtime, slug, registry) {
  try { const p = fs.readFileSync(path.join(runtime, 'tmp', slug, '.project_root'), 'utf8').trim(); if (p) return p; } catch { }
  for (const [p, s] of Object.entries(registry)) if (s === slug) return p;
  return null;
}

/** Extrae los mensajes de un archivo de chat (JSONL o el antiguo JSON completo). */
function parseMessages(text, file) {
  const byId = new Map();
  let sessionId = null;
  const add = m => { if (m && m.id && m.type) byId.set(m.id, m); };

  if (file.endsWith('.json')) {
    try {
      const obj = JSON.parse(text);
      sessionId = obj.sessionId;
      for (const m of obj.messages || []) add(m);
    } catch { }
  } else {
    for (const line of text.split('\n')) {
      if (!line) continue;
      let e;
      try { e = JSON.parse(line); } catch { continue; }
      if (e.sessionId && !sessionId) sessionId = e.sessionId;
      else if (e.$set && Array.isArray(e.$set.messages)) for (const m of e.$set.messages) add(m);
      else add(e);
    }
  }
  return { sessionId, messages: [...byId.values()] };
}

function normalize(t) {
  const input  = t.input || 0;
  const cached = t.cached || 0;
  return {
    input_tokens: Math.max(0, input - cached),
    cache_read_input_tokens: cached,
    cache_creation_input_tokens: 0,
    output_tokens: (t.output || 0) + (t.thoughts || 0),
  };
}

function load() {
  const records = [];
  let files = 0;
  const seenIds = new Set();

  for (const runtime of runtimeDirs()) {
    const tmp = path.join(runtime, 'tmp');
    let slugs;
    try { slugs = fs.readdirSync(tmp, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); } catch { continue; }
    let registry = {};
    try { registry = JSON.parse(fs.readFileSync(path.join(runtime, 'projects.json'), 'utf8')).projects || {}; } catch { }

    for (const slug of slugs) {
      const chatFiles = walk(path.join(tmp, slug, 'chats'));
      if (!chatFiles.length) continue;
      const root    = projectRoot(runtime, slug, registry);
      const project = root ? path.basename(root) : slug.length === 64 ? `gemini-${slug.slice(0, 8)}` : slug;

      for (const file of chatFiles) {
        let text;
        try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
        files++;
        const { sessionId, messages } = parseMessages(text, file);
        messages.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
        let lastModel = null;
        for (const m of messages) {
          if (m.type !== 'gemini') continue;
          if (m.model) lastModel = m.model;
          if (!m.tokens || seenIds.has(m.id)) continue;
          seenIds.add(m.id);
          const ts = new Date(m.timestamp);
          if (isNaN(ts)) continue;
          records.push({
            model: m.model || lastModel || 'gemini-unknown',
            usage: normalize(m.tokens),
            ts, sessionId: `gemini:${sessionId || path.basename(file)}`,
            project, cwd: root,
          });
        }
      }
    }
  }
  return { files, records };
}

module.exports = { id, label, load, parseMessages, normalize };
