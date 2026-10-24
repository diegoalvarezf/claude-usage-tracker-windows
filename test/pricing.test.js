// Ejecutar: npm test
const assert = require('assert');
const { resolveModel, costOfUsage } = require('../lib/pricing');
const { chargesOf } = require('../lib/usage');

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);
const M = 1_000_000;

// ── Resolución de IDs ──────────────────────────────────────────────────────────
const ids = {
  'claude-opus-5-5': 'opus-5-5', 'claude-opus-5-5[1m]': 'opus-5-5', 'claude-fable-5-1': 'fable-5-1',
  'claude-opus-4-8': 'opus-4-8', 'claude-opus-4-20250514': 'opus-4', 'claude-opus-4-1-20250805': 'opus-4-1',
  'claude-opus-4-5@20251101': 'opus-4-5', 'anthropic.claude-sonnet-4-5-20250929-v1:0': 'sonnet-4-5',
  'claude-3-5-sonnet-20241022': 'sonnet-3-5', 'claude-3-7-sonnet-20250219': 'sonnet-3-7',
  'claude-3-opus-20240229': 'opus-3', 'claude-3-haiku-20240307': 'haiku-3', 'claude-3-5-haiku-20241022': 'haiku-3-5',
  'claude-haiku-4-5-20251001': 'haiku-4-5', 'claude-sonnet-5': 'sonnet-5', 'claude-haiku-5-5': 'haiku-5-5',
};
for (const [id, key] of Object.entries(ids)) {
  const r = resolveModel(id);
  assert.strictEqual(r.key, key, id);
  assert.strictEqual(r.estimated, false, id);
}
assert.strictEqual(resolveModel('claude-opus-9').estimated, true);
assert.strictEqual(resolveModel('claude-opus-9').key, 'opus-5-5');

// ── Precios (tabla oficial, USD/MTok) ─────────────────────────────────────────
const all = { input_tokens: M, output_tokens: M, cache_read_input_tokens: M, cache_creation_input_tokens: 2 * M,
              cache_creation: { ephemeral_5m_input_tokens: M, ephemeral_1h_input_tokens: M } };
near(costOfUsage(all, 'claude-opus-5-5'),  4 + 5 + 8 + 0.20 + 20);
near(costOfUsage(all, 'claude-fable-5-1'), 10 + 12.5 + 20 + 0.25 + 50);
near(costOfUsage(all, 'claude-sonnet-5-5'), 2 + 2.5 + 4 + 0.10 + 10);
near(costOfUsage(all, 'claude-opus-4-1'),  15 + 18.75 + 30 + 1.5 + 75);

// Sin desglose de caché → 5 minutos
near(costOfUsage({ cache_creation_input_tokens: M }, 'claude-opus-4-8'), 6.25);

// Haiku 5.5: tramo > 100K tokens de prompt (incluye caché)
near(costOfUsage({ input_tokens: 50_000 }, 'claude-haiku-5-5'), 0.005);
near(costOfUsage({ input_tokens: 1_000, cache_read_input_tokens: 120_000 }, 'claude-haiku-5-5'), 0.001 * 0.5 + 0.12 * 0.05);

// Fast mode y US-only
near(costOfUsage({ input_tokens: M, output_tokens: M }, 'claude-opus-5-5', { speed: 'fast' }), 8 + 40);
near(costOfUsage({ input_tokens: M, output_tokens: M }, 'claude-opus-4-8', { speed: 'fast' }), 10 + 50);
near(costOfUsage({ input_tokens: M }, 'claude-opus-5-5', { inferenceGeo: 'us' }), 4.4);
near(costOfUsage({ input_tokens: M }, 'claude-opus-4-5', { inferenceGeo: 'us' }), 5);

// ── Fallback: cada iteración con su modelo ────────────────────────────────────
const entry = { message: { model: 'claude-opus-4-8', usage: {
  input_tokens: 0, output_tokens: M,
  iterations: [
    { type: 'message',          model: 'claude-fable-5',  output_tokens: M },
    { type: 'fallback_message', model: 'claude-opus-4-8', output_tokens: M },
  ],
  server_tool_use: { web_search_requests: 3 },
} } };
const { charges } = chargesOf(entry);
assert.strictEqual(charges.length, 2);
near(charges.reduce((s, c) => s + c.cost, 0), 50 + 25 + 0.03);

console.log('✓ pricing tests OK');
