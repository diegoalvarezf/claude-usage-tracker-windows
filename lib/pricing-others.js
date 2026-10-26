/**
 * pricing-others.js — Precios de OpenAI y Google Gemini (USD / MTok, tier estándar, solo texto).
 *
 * Fuentes (verificadas tabla a tabla en las páginas oficiales el 2026-10-26):
 *   https://developers.openai.com/api/docs/pricing
 *   https://ai.google.dev/gemini-api/docs/pricing   ("Last updated 2026-10-22 UTC")
 *
 * Mismo formato que pricing.js: input (sin caché), cw5m/cw1h (escritura de caché), cr (lectura), output.
 *   OpenAI: cw5m = escritura de 30 min (1.25×), cw1h = escritura de 12 h (2.5×), solo GPT-5.6 y posteriores.
 *           Contexto largo: prompts de más de 272K tokens.
 *   Gemini: la salida incluye los tokens de razonamiento ("thoughts"). Contexto largo: más de 200K tokens.
 *           `changes` = subidas de precio anunciadas con fecha.
 */

// Sin precio de escritura publicado: se cobra como entrada normal
const o = (name, input, cr, output, extra = {}) => ({
  provider: 'openai', name, status: 'current', input, cw5m: input, cw1h: input, cr: cr == null ? input : cr, output, ...extra,
});
const g = (name, input, cr, output, extra = {}) => ({
  provider: 'google', name, status: 'current', input, cw5m: input, cw1h: input, cr, output, ...extra,
});
// Contexto largo; `writes` = el modelo cobra escrituras de caché (1.25× a 30 min, 2.5× a 12 h sobre la entrada)
const lc = (threshold, input, cr, output, writes) => ({ threshold, input, cw5m: writes ? input * 1.25 : input, cw1h: writes ? input * 2.5 : input, cr: cr == null ? input : cr, output });
const OAI_LC = 272_000, GEM_LC = 200_000;

const OTHER_MODELS = {
  // ── OpenAI ──────────────────────────────────────────────────────────────────
  'gpt-6-astra':   o('GPT-6 Astra',   10.00, 1.00,  50.00, { cw5m: 12.50, cw1h: 25.00, long: lc(OAI_LC, 20, 2, 75, true) }),
  'gpt-6.1-sol':   o('GPT-6.1 Sol',    2.00, 0.10,  10.00, { cw5m: 2.50,  cw1h: 5.00,  long: lc(OAI_LC, 4, 0.20, 15, true) }),
  'gpt-6-sol':     o('GPT-6 Sol',      2.00, 0.20,  10.00, { cw5m: 2.50,  cw1h: 5.00,  long: lc(OAI_LC, 4, 0.40, 15, true) }),
  'gpt-6-luna':    o('GPT-6 Luna',     0.10, 0.01,   0.50, { cw5m: 0.125, cw1h: 0.25,  long: lc(OAI_LC, 0.20, 0.02, 0.75, true) }),
  'gpt-5.6-sol':   o('GPT-5.6 Sol',    4.00, 0.40,  20.00, { cw5m: 5.00,  cw1h: 10.00, long: lc(OAI_LC, 8, 0.80, 30, true) }),
  'gpt-5.6-terra': o('GPT-5.6 Terra',  2.00, 0.20,  12.00, { cw5m: 2.50,  cw1h: 5.00,  long: lc(OAI_LC, 4, 0.40, 18, true) }),
  'gpt-5.6-luna':  o('GPT-5.6 Luna',   0.20, 0.02,   1.20, { cw5m: 0.25,  cw1h: 0.50,  long: lc(OAI_LC, 0.40, 0.04, 1.80, true) }),
  'gpt-5.6-cyber': o('GPT-5.6 Cyber', 12.50, 1.25,  75.00, { cw5m: 15.625, cw1h: 31.25 }),
  'chat-latest':   o('ChatGPT (chat-latest)', 5.00, 0.50, 30.00),
  'gpt-5.5':       o('GPT-5.5',        5.00, 0.50,  30.00, { status: 'legacy', long: lc(OAI_LC, 10, 1, 45) }),
  'gpt-5.5-pro':   o('GPT-5.5 Pro',   30.00, null, 180.00, { status: 'legacy', long: lc(OAI_LC, 60, null, 270) }),
  'gpt-5.4':       o('GPT-5.4',        2.50, 0.25,  15.00, { status: 'legacy', long: lc(OAI_LC, 5, 0.50, 22.50) }),
  'gpt-5.4-pro':   o('GPT-5.4 Pro',   30.00, null, 180.00, { status: 'legacy', long: lc(OAI_LC, 60, null, 270) }),
  'gpt-5.4-mini':  o('GPT-5.4 mini',   0.75, 0.075,  4.50, { status: 'legacy' }),
  'gpt-5.4-nano':  o('GPT-5.4 nano',   0.20, 0.02,   1.25, { status: 'legacy' }),
  'gpt-5.3-codex': o('GPT-5.3 Codex',  1.75, 0.175, 14.00, { status: 'legacy' }),
  'gpt-5.2':       o('GPT-5.2',        1.75, 0.175, 14.00, { status: 'legacy' }),
  'gpt-5.2-pro':   o('GPT-5.2 Pro',   21.00, null, 168.00, { status: 'legacy' }),
  'gpt-5.1':       o('GPT-5.1',        1.25, 0.125, 10.00, { status: 'legacy' }),
  'gpt-5':         o('GPT-5',          1.25, 0.125, 10.00, { status: 'legacy' }),
  'gpt-5-mini':    o('GPT-5 mini',     0.25, 0.025,  2.00, { status: 'legacy' }),
  'gpt-5-nano':    o('GPT-5 nano',     0.05, 0.005,  0.40, { status: 'legacy' }),
  'gpt-5-pro':     o('GPT-5 Pro',     15.00, null, 120.00, { status: 'legacy' }),
  'gpt-4.1':       o('GPT-4.1',        2.00, 0.50,   8.00, { status: 'legacy' }),
  'gpt-4.1-mini':  o('GPT-4.1 mini',   0.40, 0.10,   1.60, { status: 'legacy' }),
  'gpt-4.1-nano':  o('GPT-4.1 nano',   0.10, 0.025,  0.40, { status: 'legacy' }),
  'gpt-4o':        o('GPT-4o',         2.50, 1.25,  10.00, { status: 'legacy' }),
  'gpt-4o-mini':   o('GPT-4o mini',    0.15, 0.075,  0.60, { status: 'legacy' }),
  'o3':            o('o3',             2.00, 0.50,   8.00, { status: 'legacy' }),
  'o3-pro':        o('o3 Pro',        20.00, null,  80.00, { status: 'legacy' }),
  'o4-mini':       o('o4-mini',        1.10, 0.275,  4.40, { status: 'legacy' }),
  'o3-mini':       o('o3-mini',        1.10, 0.55,   4.40, { status: 'legacy' }),
  'o1-pro':        o('o1 Pro',       150.00, null, 600.00, { status: 'legacy' }),
  'o1':            o('o1',            15.00, 7.50,  60.00, { status: 'legacy' }),

  // ── Google Gemini ───────────────────────────────────────────────────────────
  'gemini-4-argon':         g('Gemini 4 Argon',         2.00, 0.10, 10.00, { changes: [{ from: '2026-12-01', input: 4.00, cw5m: 4.00, cw1h: 4.00, cr: 0.20, output: 20.00 }] }),
  'gemini-3.8-flash':       g('Gemini 3.8 Flash',       0.75, 0.075, 3.75, { changes: [{ from: '2027-01-01', input: 1.50, cw5m: 1.50, cw1h: 1.50, cr: 0.15, output: 7.50 }] }),
  'gemini-3.6-flash':       g('Gemini 3.6 Flash',       0.75, 0.075, 3.75, { status: 'legacy', changes: [{ from: '2027-01-01', input: 1.50, cw5m: 1.50, cw1h: 1.50, cr: 0.15, output: 7.50 }] }),
  'gemini-3.1-pro-preview': g('Gemini 3.1 Pro',         2.00, 0.20, 12.00, { long: lc(GEM_LC, 4.00, 0.40, 18.00) }),
  'gemini-3.1-pro-preview-customtools': g('Gemini 3.1 Pro', 2.00, 0.20, 12.00, { long: lc(GEM_LC, 4.00, 0.40, 18.00) }),
  'gemini-3-flash-preview': g('Gemini 3 Flash',         0.50, 0.05,  3.00, { status: 'legacy' }),
  'gemini-3.5-flash-lite':  g('Gemini 3.5 Flash-Lite',  0.30, 0.03,  2.50),
  'gemini-3.1-flash-lite':  g('Gemini 3.1 Flash-Lite',  0.25, 0.025, 1.50, { status: 'legacy' }),
  'gemini-2.5-pro':         g('Gemini 2.5 Pro',         1.25, 0.125, 10.00, { status: 'legacy', long: lc(GEM_LC, 2.50, 0.25, 15.00) }),
  'gemini-2.5-flash':       g('Gemini 2.5 Flash',       0.30, 0.03,  2.50, { status: 'legacy' }),
  'gemini-2.5-flash-lite':  g('Gemini 2.5 Flash-Lite',  0.10, 0.01,  0.40, { status: 'legacy' }),
};

module.exports = { OTHER_MODELS };
