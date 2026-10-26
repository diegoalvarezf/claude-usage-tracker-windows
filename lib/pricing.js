/**
 * pricing.js — Precios oficiales de la API de Anthropic y cálculo de coste.
 *
 * Fuente: https://platform.claude.com/docs/en/about-claude/pricing
 * Revisado: 2026-10-24
 *
 * Todos los importes en USD por millón de tokens (MTok).
 *   input   → tokens de entrada sin caché
 *   cw5m    → escritura de caché de 5 minutos (1.25× input)
 *   cw1h    → escritura de caché de 1 hora    (2×    input)
 *   cr      → lectura de caché (0.1× input en general; 0.05× en Opus/Sonnet 5.5; 0.025× en Fable/Mythos 5.1)
 *   output  → tokens de salida
 */

const PRICING_UPDATED = '2026-10-24';

// Coste fijo de herramientas de servidor
const WEB_SEARCH_PER_REQUEST = 10 / 1000;   // $10 por cada 1.000 búsquedas (web fetch es gratis)

// Recargo por inferencia solo en EE. UU. (inference_geo: "us"), modelos 4.6 o posteriores
const US_GEO_MULTIPLIER = 1.1;

const p = (input, cw5m, cw1h, cr, output) => ({ input, cw5m, cw1h, cr, output });

/**
 * Clave = familia-major-minor normalizada (ver resolveModel).
 * `status`: current | legacy | deprecated | retired.
 * `historical: true` → la página oficial ya no lista el precio; se usa el último precio publicado.
 */
const MODELS = {
  'fable-5-1':   { name: 'Fable 5.1',   status: 'current',    ...p(10,   12.50, 20,   0.25, 50)  },
  'mythos-5-1':  { name: 'Mythos 5.1',  status: 'current',    ...p(10,   12.50, 20,   0.25, 50)  },
  'fable-5':     { name: 'Fable 5',     status: 'legacy',     ...p(10,   12.50, 20,   1.00, 50)  },
  'mythos-5':    { name: 'Mythos 5',    status: 'legacy',     ...p(10,   12.50, 20,   1.00, 50)  },

  'opus-5-5':    { name: 'Opus 5.5',    status: 'current',    ...p(4,    5.00,  8,    0.20, 20), fast: { input: 8,  output: 40 } },
  'opus-5':      { name: 'Opus 5',      status: 'legacy',     ...p(5,    6.25,  10,   0.50, 25), fast: { input: 10, output: 50 } },
  'opus-4-8':    { name: 'Opus 4.8',    status: 'legacy',     ...p(5,    6.25,  10,   0.50, 25), fast: { input: 10, output: 50 } },
  'opus-4-7':    { name: 'Opus 4.7',    status: 'legacy',     ...p(5,    6.25,  10,   0.50, 25)  },
  'opus-4-6':    { name: 'Opus 4.6',    status: 'legacy',     ...p(5,    6.25,  10,   0.50, 25)  },
  'opus-4-5':    { name: 'Opus 4.5',    status: 'legacy',     ...p(5,    6.25,  10,   0.50, 25)  },
  'opus-4-1':    { name: 'Opus 4.1',    status: 'retired',    ...p(15,   18.75, 30,   1.50, 75)  },
  'opus-4':      { name: 'Opus 4',      status: 'retired',    ...p(15,   18.75, 30,   1.50, 75)  },
  'opus-3':      { name: 'Opus 3',      status: 'retired',    ...p(15,   18.75, 30,   1.50, 75), historical: true },

  'sonnet-5-5':  { name: 'Sonnet 5.5',  status: 'current',    ...p(2,    2.50,  4,    0.10, 10)  },
  'sonnet-5':    { name: 'Sonnet 5',    status: 'legacy',     ...p(2,    2.50,  4,    0.20, 10)  },
  'sonnet-4-6':  { name: 'Sonnet 4.6',  status: 'legacy',     ...p(3,    3.75,  6,    0.30, 15)  },
  'sonnet-4-5':  { name: 'Sonnet 4.5',  status: 'deprecated', ...p(3,    3.75,  6,    0.30, 15)  },
  'sonnet-4':    { name: 'Sonnet 4',    status: 'retired',    ...p(3,    3.75,  6,    0.30, 15)  },
  'sonnet-3-7':  { name: 'Sonnet 3.7',  status: 'retired',    ...p(3,    3.75,  6,    0.30, 15), historical: true },
  'sonnet-3-5':  { name: 'Sonnet 3.5',  status: 'retired',    ...p(3,    3.75,  6,    0.30, 15), historical: true },

  'haiku-5-5':   { name: 'Haiku 5.5',   status: 'current',    ...p(0.10, 0.125, 0.20, 0.01, 0.50),
                   long: { threshold: 100_000, ...p(0.50, 0.625, 1.00, 0.05, 2.50) } },
  'haiku-4-5':   { name: 'Haiku 4.5',   status: 'legacy',     ...p(1,    1.25,  2,    0.10, 5)   },
  'haiku-3-5':   { name: 'Haiku 3.5',   status: 'retired',    ...p(0.80, 1.00,  1.60, 0.08, 4)   },
  'haiku-3':     { name: 'Haiku 3',     status: 'retired',    ...p(0.25, 0.30,  0.50, 0.03, 1.25), historical: true },
};

// Si aparece un modelo desconocido, se estima con el más reciente de su familia
const FAMILY_FALLBACK = {
  fable: 'fable-5-1', mythos: 'mythos-5-1', opus: 'opus-5-5', sonnet: 'sonnet-5-5', haiku: 'haiku-5-5',
};
const DEFAULT_KEY = 'sonnet-5-5';

for (const m of Object.values(MODELS)) m.provider = 'anthropic';

// ─── OpenAI y Google ──────────────────────────────────────────────────────────
// Estos proveedores no desglosan las escrituras de caché en los logs de sus CLI:
// la entrada se divide en "sin caché" (input) y "leída de caché" (cr). El razonamiento se cobra como salida.
const { OTHER_MODELS } = require('./pricing-others');
const OTHER_KEYS = Object.keys(OTHER_MODELS).sort((a, b) => b.length - a.length);   // el prefijo más largo gana

function resolveOther(id) {
  const clean = id.replace(/^(openai|google|models|vertex_ai|gemini)\//, '');
  const key = OTHER_KEYS.find(k => clean === k || clean.startsWith(k + '-') || clean.startsWith(k + '@'));
  if (!key) return null;
  const rest = clean.slice(key.length);
  // Sufijos de fecha / alias no cambian el precio; cualquier otro sufijo es una variante sin precio propio
  const estimated = !/^(-\d{4}-\d{2}-\d{2}|-\d{8}|-latest|-preview(-\d{2}-\d{4})?|@\d+)?$/.test(rest);
  return { key, pricing: OTHER_MODELS[key], estimated };
}

const _resolveCache = new Map();

/**
 * Normaliza cualquier ID de modelo a una clave de MODELS.
 * Acepta: claude-opus-5-5, claude-opus-4-20250514, claude-3-5-sonnet-20241022,
 *         anthropic.claude-sonnet-4-5-20250929-v1:0, claude-opus-4-5@20251101, claude-opus-5-5[1m]...
 * Devuelve { key, pricing, estimated } — estimated = true si no hubo coincidencia exacta.
 */
function resolveModel(model) {
  const raw = String(model || '');
  if (_resolveCache.has(raw)) return _resolveCache.get(raw);

  const id = raw.toLowerCase();
  if (/^(openai\/|google\/|models\/)?(gpt-|o\d|codex|chat-latest|gemini-)/.test(id)) {
    const other = resolveOther(id);
    const fb    = id.includes('gemini') ? 'gemini-3.8-flash' : 'gpt-6.1-sol';
    const r     = other || { key: fb, pricing: OTHER_MODELS[fb], estimated: true };
    _resolveCache.set(raw, r);
    return r;
  }
  const fam = (id.match(/(fable|mythos|opus|sonnet|haiku)/) || [])[1];
  let key = null;

  if (fam) {
    // Formato nuevo: claude-<familia>-<major>[-<minor>]   (minor de 1-2 dígitos, nunca una fecha)
    let m = id.match(new RegExp(`${fam}-(\\d{1,2})(?:[-.](\\d{1,2}))?(?!\\d)`));
    // Formato antiguo: claude-<major>[-<minor>]-<familia>
    if (!m) m = id.match(new RegExp(`claude-(\\d{1,2})(?:[-.](\\d{1,2}))?-${fam}`));
    if (m) {
      const exact = m[2] ? `${fam}-${m[1]}-${m[2]}` : `${fam}-${m[1]}`;
      if (MODELS[exact]) key = exact;
    }
  }

  const result = key
    ? { key, pricing: MODELS[key], estimated: false }
    : { key: FAMILY_FALLBACK[fam] || DEFAULT_KEY, pricing: MODELS[FAMILY_FALLBACK[fam] || DEFAULT_KEY], estimated: true };
  _resolveCache.set(raw, result);
  return result;
}

/** ¿Modelo 4.6 o posterior? (aplica el recargo de inference_geo "us") */
function isGeoEligible(key) {
  const m = key.match(/-(\d+)(?:-(\d+))?$/);
  if (!m) return false;
  const major = +m[1], minor = +(m[2] || 0);
  return major > 4 || (major === 4 && minor >= 6);
}

/** Desglosa las escrituras de caché en 5m / 1h. Sin desglose, se asume 5m (comportamiento clásico de la API). */
function splitCacheWrite(u) {
  const cc = u.cache_creation;
  if (cc && (cc.ephemeral_5m_input_tokens != null || cc.ephemeral_1h_input_tokens != null)) {
    return { w5m: cc.ephemeral_5m_input_tokens || 0, w1h: cc.ephemeral_1h_input_tokens || 0 };
  }
  return { w5m: u.cache_creation_input_tokens || 0, w1h: 0 };
}

/**
 * Coste en USD de un bloque de uso (una iteración de la API).
 * `opts`: { speed, inferenceGeo, ts }
 */
function costOfUsage(u, model, opts = {}) {
  const { key, pricing } = resolveModel(model);
  const input  = u.input_tokens            || 0;
  const read   = u.cache_read_input_tokens || 0;
  const output = u.output_tokens           || 0;
  const { w5m, w1h } = splitCacheWrite(u);

  // Precio vigente en la fecha de la petición (algunos proveedores anuncian subidas)
  let base = pricing;
  if (pricing.changes && opts.ts) {
    const day = String(opts.ts).slice(0, 10);
    for (const c of pricing.changes) if (day >= c.from) base = { ...base, ...c };
  }
  // Tramo de contexto largo: el umbral cuenta todo el prompt, incluida la caché
  let rate = base;
  if (base.long && input + read + w5m + w1h > base.long.threshold) rate = base.long;

  // Fast mode: precio premium; los multiplicadores de caché se aplican sobre el nuevo precio de entrada
  let inMul = 1, outMul = 1;
  if (opts.speed === 'fast' && pricing.fast) {
    inMul  = pricing.fast.input  / pricing.input;
    outMul = pricing.fast.output / pricing.output;
  }
  const geoMul = opts.inferenceGeo === 'us' && pricing.provider === 'anthropic' && isGeoEligible(key) ? US_GEO_MULTIPLIER : 1;

  const M = 1_000_000;
  return geoMul * (
    (input  / M) * rate.input * inMul +
    (w5m    / M) * rate.cw5m  * inMul +
    (w1h    / M) * rate.cw1h  * inMul +
    (read   / M) * rate.cr    * inMul +
    (output / M) * rate.output * outMul
  );
}

/**
 * Ahorro que ha supuesto la caché: lo que habrían costado las lecturas de caché como entrada normal.
 */
function cacheSavingsOfUsage(u, model) {
  const { pricing } = resolveModel(model);
  return ((u.cache_read_input_tokens || 0) / 1_000_000) * (pricing.input - pricing.cr);
}

module.exports = {
  PRICING_UPDATED,
  MODELS,
  WEB_SEARCH_PER_REQUEST,
  resolveModel,
  splitCacheWrite,
  costOfUsage,
  cacheSavingsOfUsage,
};
