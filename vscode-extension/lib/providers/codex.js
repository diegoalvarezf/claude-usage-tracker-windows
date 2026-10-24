/**
 * codex.js — Uso de OpenAI Codex CLI.
 *
 * Logs: $CODEX_HOME (o ~/.codex)/sessions/YYYY/MM/DD/rollout-*.jsonl  (+ archived_sessions/)
 * Formato verificado contra openai/codex @970111f6 (2026-10-23).
 *
 * Fuentes de tokens, por orden de preferencia:
 *   1. token_usage_record (v0.153+): una por respuesta de la API → se suman y se deduplican por response_id.
 *   2. event_msg/token_count: total_token_usage es ACUMULADO por sesión y el evento se repite sin uso nuevo
 *      (avisos de rate limit, re-estimaciones) → se toman deltas y se ignoran los nulos o negativos (reinicios).
 * input_tokens INCLUYE cached_input_tokens (y las escrituras de caché); el razonamiento va dentro de output_tokens.
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const zlib = require('zlib');

const id    = 'codex';
const label = 'Codex CLI';

function codexHome() {
  return process.env.CODEX_HOME && process.env.CODEX_HOME.trim() ? process.env.CODEX_HOME : path.join(os.homedir(), '.codex');
}

function walk(dir, out = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/^rollout-.*\.jsonl(\.zst)?$/.test(e.name)) out.push(full);
  }
  return out;
}

function readText(file) {
  const buf = fs.readFileSync(file);
  if (!file.endsWith('.zst')) return buf.toString('utf8');
  if (typeof zlib.zstdDecompressSync !== 'function') return '';   // Node < 22.15: se omiten los comprimidos
  return zlib.zstdDecompressSync(buf).toString('utf8');
}

/** TokenUsage de Codex → forma de uso de Anthropic (lo que espera costOfUsage). */
function normalize(t) {
  const input  = t.input_tokens || 0;
  const cached = t.cached_input_tokens || 0;
  const writes = t.cache_write_input_tokens || 0;
  return {
    input_tokens: Math.max(0, input - cached - writes),
    cache_read_input_tokens: cached,
    cache_creation_input_tokens: writes,
    cache_creation: { ephemeral_5m_input_tokens: writes, ephemeral_1h_input_tokens: 0 },
    output_tokens: t.output_tokens || 0,
  };
}

const sub = (a, b) => {
  const k = ['input_tokens', 'cached_input_tokens', 'cache_write_input_tokens', 'output_tokens'];
  return Object.fromEntries(k.map(x => [x, (a[x] || 0) - (b[x] || 0)]));
};

function parseFile(text, file, seen) {
  let meta = null, model = null;
  const records = [], legacy = [];
  let hasRecords = false;

  for (const line of text.split('\n')) {
    if (!line) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    const p = e.payload || {};
    if (e.type === 'session_meta' && !meta) meta = p;
    else if (e.type === 'turn_context' && p.model) model = p.model;
    else if (e.type === 'token_usage_record' && p.usage) {
      hasRecords = true;
      if (p.response_id) { if (seen.has(p.response_id)) continue; seen.add(p.response_id); }
      records.push({ ts: e.timestamp, model, usage: p.usage, sessionId: p.session_id || p.thread_id });
    } else if (e.type === 'event_msg' && p.type === 'token_count' && p.info && p.info.total_token_usage) {
      legacy.push({ ts: e.timestamp, model, info: p.info });
    }
  }

  const sessionId = (meta && (meta.id || meta.session_id)) || path.basename(file);
  const cwd = meta && meta.cwd;
  const out = [];
  if (hasRecords) {
    for (const r of records) out.push({ ...r, sessionId: r.sessionId || sessionId, cwd });
  } else {
    let prev = null;
    for (const ev of legacy) {
      const total = ev.info.total_token_usage;
      // Los forks copian los token_count del padre (con timestamp nuevo): se descartan por huella
      const fp = JSON.stringify(ev.info.total_token_usage) + JSON.stringify(ev.info.last_token_usage || null);
      const d = prev ? sub(total, prev) : sub(total, {});
      prev = total;
      if (seen.has(fp)) continue;
      seen.add(fp);
      if (d.input_tokens < 0 || d.output_tokens < 0) continue;              // reinicio (contexto lleno, compactación)
      if (!d.input_tokens && !d.output_tokens) continue;                     // repetición sin uso nuevo
      out.push({ ts: ev.ts, model: ev.model, usage: d, sessionId, cwd });
    }
  }
  return out;
}

function load() {
  const home  = codexHome();
  const files = [...walk(path.join(home, 'sessions')), ...walk(path.join(home, 'archived_sessions'))];
  const seen  = new Set();
  const records = [];
  for (const file of files) {
    let text;
    try { text = readText(file); } catch { continue; }
    for (const r of parseFile(text, file, seen)) {
      const ts = new Date(r.ts);
      if (isNaN(ts)) continue;
      records.push({
        model: r.model || 'gpt-codex-unknown',
        usage: normalize(r.usage),
        ts, sessionId: `codex:${r.sessionId}`,
        project: r.cwd ? path.basename(r.cwd) : 'codex',
        cwd: r.cwd,
      });
    }
  }
  return { files: files.length, records };
}

module.exports = { id, label, load, parseFile, normalize };
