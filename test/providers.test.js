// Ejecutar: npm test — logs sintéticos con el formato real de Codex CLI y Gemini CLI
const assert = require('assert');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cut-test-'));
process.env.CODEX_HOME      = path.join(tmp, 'codex');
process.env.GEMINI_CLI_HOME = path.join(tmp, 'ghome');

const codex  = require('../lib/providers/codex');
const gemini = require('../lib/providers/gemini');
const { costOfUsage } = require('../lib/pricing');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);
const L = o => JSON.stringify(o);

// ── Codex: token_count acumulado, con repeticiones y un reinicio ─────────────
const tc = (ts, total, last) => L({ timestamp: ts, type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: total, last_token_usage: last }, rate_limits: null } });
const T = (i, c, o) => ({ input_tokens: i, cached_input_tokens: c, cache_write_input_tokens: 0, output_tokens: o, reasoning_output_tokens: 0, total_tokens: i + o });
const day = path.join(process.env.CODEX_HOME, 'sessions', '2026', '10', '23');
fs.mkdirSync(day, { recursive: true });
fs.writeFileSync(path.join(day, 'rollout-2026-10-23T10-00-00-aaa.jsonl'), [
  L({ timestamp: '2026-10-23T10:00:00.000Z', type: 'session_meta', payload: { id: 'aaa', cwd: '/home/u/repos/webapp' } }),
  L({ timestamp: '2026-10-23T10:00:00.100Z', type: 'turn_context', payload: { model: 'gpt-6.1-sol', cwd: '/home/u/repos/webapp' } }),
  tc('2026-10-23T10:00:05.000Z', T(10000, 8000, 100), T(10000, 8000, 100)),
  tc('2026-10-23T10:00:06.000Z', T(10000, 8000, 100), T(10000, 8000, 100)),     // repetición (rate limit)
  tc('2026-10-23T10:00:09.000Z', T(25000, 20000, 300), T(15000, 12000, 200)),
  tc('2026-10-23T10:00:10.000Z', { input_tokens: 0, output_tokens: 0, total_tokens: 272000 }, null),   // reinicio
  'línea rota {',
].join('\n'));
// Fork: copia los eventos del padre (timestamp nuevo, mismo info) → no deben contarse
fs.writeFileSync(path.join(day, 'rollout-2026-10-23T11-00-00-bbb.jsonl'), [
  L({ timestamp: '2026-10-23T11:00:00.000Z', type: 'session_meta', payload: { id: 'bbb', cwd: '/home/u/repos/webapp', forked_from_id: 'aaa' } }),
  L({ timestamp: '2026-10-23T11:00:00.000Z', type: 'turn_context', payload: { model: 'gpt-6.1-sol' } }),
  tc('2026-10-23T11:00:01.000Z', T(10000, 8000, 100), T(10000, 8000, 100)),
].join('\n'));
// Formato nuevo: token_usage_record (preferente) con un duplicado por response_id
const rec = (rid, u) => L({ timestamp: '2026-10-23T12:00:01.000Z', type: 'token_usage_record', payload: { session_id: 'ccc', response_id: rid, usage: u } });
fs.writeFileSync(path.join(day, 'rollout-2026-10-23T12-00-00-ccc.jsonl'), [
  L({ timestamp: '2026-10-23T12:00:00.000Z', type: 'session_meta', payload: { id: 'ccc', cwd: '/home/u/repos/api' } }),
  L({ timestamp: '2026-10-23T12:00:00.000Z', type: 'turn_context', payload: { model: 'gpt-5.6-terra' } }),
  rec('resp_1', { input_tokens: 1000, cached_input_tokens: 0, cache_write_input_tokens: 800, output_tokens: 50 }),
  rec('resp_1', { input_tokens: 1000, cached_input_tokens: 0, cache_write_input_tokens: 800, output_tokens: 50 }),
  tc('2026-10-23T12:00:02.000Z', T(999999, 0, 999999), T(999999, 0, 999999)),   // ignorado: hay records
].join('\n'));

const cx = codex.load();
assert.strictEqual(cx.files, 3);
const web = cx.records.filter(r => r.project === 'webapp');
assert.strictEqual(web.length, 2, 'dos respuestas reales en webapp');
assert.deepStrictEqual(web.map(r => r.usage.cache_read_input_tokens), [8000, 12000]);
assert.deepStrictEqual(web.map(r => r.usage.input_tokens), [2000, 3000]);
assert.deepStrictEqual(web.map(r => r.usage.output_tokens), [100, 200]);
const api = cx.records.filter(r => r.project === 'api');
assert.strictEqual(api.length, 1);
assert.strictEqual(api[0].model, 'gpt-5.6-terra');
assert.deepStrictEqual([api[0].usage.input_tokens, api[0].usage.cache_creation_input_tokens], [200, 800]);
// GPT-6.1 Sol: $2 entrada, $0.10 caché, $10 salida
near(costOfUsage(web[0].usage, web[0].model), (2000 * 2 + 8000 * 0.10 + 100 * 10) / 1e6);
// GPT-5.6 Terra: escritura 30 min a $2.50
near(costOfUsage(api[0].usage, api[0].model), (200 * 2 + 800 * 2.5 + 50 * 12) / 1e6);

// ── Gemini: mensajes reescritos, subagente, modelo heredado ──────────────────
const gtmp = path.join(process.env.GEMINI_CLI_HOME, '.gemini', 'tmp', 'mi-repo');
fs.mkdirSync(path.join(gtmp, 'chats', 'sess-1'), { recursive: true });
fs.writeFileSync(path.join(gtmp, '.project_root'), '/home/u/repos/mi-repo\n');
const gm = (id, ts, tokens, model) => L({ id, timestamp: ts, type: 'gemini', content: '…', ...(model ? { model } : {}), ...(tokens ? { tokens } : {}) });
fs.writeFileSync(path.join(gtmp, 'chats', 'session-2026-10-23T10-00-sess1abc.jsonl'), [
  L({ sessionId: 'sess-1', projectHash: 'x', startTime: '2026-10-23T10:00:00.000Z', kind: 'main' }),
  L({ id: 'u1', timestamp: '2026-10-23T10:00:00.000Z', type: 'user', content: 'hola' }),
  gm('g1', '2026-10-23T10:00:02.000Z', null, 'gemini-2.5-pro'),                                        // aún sin tokens
  gm('g1', '2026-10-23T10:00:02.000Z', { input: 15000, output: 400, cached: 12000, thoughts: 600, tool: 0, total: 16000 }, 'gemini-2.5-pro'),
  L({ $patch: { id: 'g1', content: 'editado' } }),
  gm('g2', '2026-10-23T10:01:00.000Z', { input: 1000, output: 100, cached: 0, thoughts: 0 }),            // sin modelo → hereda
].join('\n'));
fs.writeFileSync(path.join(gtmp, 'chats', 'sess-1', 'sub-1.jsonl'), [
  L({ sessionId: 'sub-1', kind: 'subagent' }),
  gm('s1', '2026-10-23T10:00:30.000Z', { input: 2000, output: 50, cached: 0, thoughts: 10 }, 'gemini-3.8-flash'),
].join('\n'));

const gx = gemini.load();
assert.strictEqual(gx.files, 2);
assert.strictEqual(gx.records.length, 3);
const g1 = gx.records.find(r => r.usage.cache_read_input_tokens === 12000);
assert.deepStrictEqual([g1.usage.input_tokens, g1.usage.output_tokens, g1.project], [3000, 1000, 'mi-repo']);
assert.strictEqual(gx.records.find(r => r.usage.input_tokens === 1000).model, 'gemini-2.5-pro');
// Gemini 2.5 Pro: $1.25 entrada, $0.125 caché, $10 salida (incl. thoughts)
near(costOfUsage(g1.usage, g1.model), (3000 * 1.25 + 12000 * 0.125 + 1000 * 10) / 1e6);

// ── Integración: loadUsage mezcla los tres proveedores ───────────────────────
const { loadUsage } = require('../lib/usage');
const d = loadUsage({ now: new Date('2026-10-23T18:00:00Z') });
assert.ok(d.byProvider.openai && d.byProvider.openai.requests === 3);
assert.ok(d.byProvider.google && d.byProvider.google.requests === 3);
assert.ok(d.sources.some(s => s.id === 'codex') && d.sources.some(s => s.id === 'gemini'));

fs.rmSync(tmp, { recursive: true, force: true });
console.log('✓ providers tests OK');
