/**
 * report.js — Genera el reporte HTML (autocontenido, funciona sin conexión).
 *
 * El servidor solo serializa los datos; los gráficos, pestañas, filtros y el export CSV
 * se pintan en el navegador a partir de window.DATA.
 */

const { MODELS, PRICING_UPDATED, resolveModel } = require('./pricing');

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function prettyModel(id) {
  const { pricing, estimated } = resolveModel(id);
  return estimated ? id : pricing.name;
}

/** Datos mínimos para el cliente (nada de rutas de archivos ni contenido de los logs). */
function serialize(data, insights, opts) {
  const models = Object.entries(data.byModel)
    .sort((a, b) => b[1].cost - a[1].cost)
    .map(([id, m]) => {
      const { key, pricing, estimated } = resolveModel(id);
      return {
        id, name: prettyModel(id), key, status: pricing.status, estimated, provider: pricing.provider || 'anthropic',
        cost: m.cost, requests: m.requests,
        input: m.input, cacheWrite: m.cacheWrite, cacheRead: m.cacheRead, output: m.output,
      };
    });

  const projects = Object.entries(data.byProject)
    .sort((a, b) => b[1].cost - a[1].cost)
    .map(([name, p]) => ({
      name, cost: p.cost, tokens: p.tokens, requests: p.requests, sessions: p.sessions,
      lastUsed: p.lastUsed ? p.lastUsed.toISOString() : null,
      models: Object.entries(p.models).sort((a, b) => b[1] - a[1]).map(([id, c]) => [prettyModel(id), c]),
    }));

  const months = Object.keys(data.byMonth).sort().map(key => {
    const projs = Object.entries(data.byMonth[key]).sort((a, b) => b[1].cost - a[1].cost);
    return {
      key,
      cost: projs.reduce((s, [, p]) => s + p.cost, 0),
      projects: projs.map(([name, p]) => ({ name, cost: p.cost, tokens: p.tokens,
        models: Object.entries(p.models).sort((a, b) => b[1] - a[1]).map(([id, c]) => [prettyModel(id), c]) })),
      models: Object.fromEntries(Object.entries(data.byMonthModel[key] || {}).map(([id, m]) => [id, m.cost])),
    };
  });

  return {
    plan: opts.plan,
    generatedAt: data.generatedAt.toISOString(),
    today: data.today, thisMonth: data.thisMonth,
    pricingUpdated: PRICING_UPDATED,
    totals: {
      cost: data.totals.cost, savings: data.totals.savings, requests: data.totals.requests,
      tok: data.totals.tok, webSearches: data.totals.webSearches,
    },
    todayTot: { cost: data.todayTot.cost, requests: data.todayTot.requests, tok: data.todayTot.tok },
    monthCost: data.monthCost,
    days: data.byDay,
    months, models, projects,
    unknownModels: data.unknownModels,
    firstTs: data.firstTs ? data.firstTs.toISOString() : null,
    sources: data.sources && data.sources.length ? data.sources : [{ id: 'claude', label: 'Claude Code' }],
    providers: Object.entries(data.byProvider || {}).sort((a, b) => b[1].cost - a[1].cost).map(([id, v]) => ({ id, ...v })),
    insights,
  };
}

function renderReport(data, insights, opts = {}) {
  const payload = JSON.stringify(serialize(data, insights, opts)).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Claude Usage Tracker</title>
${opts.logoB64
  ? `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,${opts.logoB64}">`
  : `<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' fill='%23FF7900'/></svg>">`}
<style>${CSS}</style>
</head>
<body>
<header class="top">
  <div class="top-l">
    <div class="logo">${opts.logoInline || '<span class="logo-sq"></span>'}</div>
    <div>
      <div class="top-title">Claude Usage Tracker</div>
      <div class="top-sub" id="top-sub"></div>
    </div>
  </div>
  <div class="top-r">
    <span class="pill" id="mode-pill"></span>
    <button class="btn icon" id="theme-btn" title="Cambiar tema" aria-label="Cambiar tema">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
    </button>
    <button class="btn" id="csv-btn">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v3h16v-3"/></svg>
      CSV
    </button>
  </div>
</header>

<main class="wrap">
  <div id="banners"></div>

  <section class="hero">
    <div class="hero-main">
      <div class="eyebrow" id="hero-label"></div>
      <div class="hero-num" id="hero-num"></div>
      <div class="hero-meta" id="hero-meta"></div>
      <div class="progress" id="hero-progress"></div>
    </div>
    <div class="tiles" id="tiles"></div>
  </section>

  <section class="block">
    <div class="block-head">
      <h2>Consejos para ti</h2>
      <span class="muted" id="tips-sub"></span>
    </div>
    <div class="tips" id="tips"></div>
  </section>

  <section class="grid2">
    <div class="panel">
      <div class="panel-head">
        <div><h3>Gasto diario</h3><div class="muted small" id="daily-sub"></div></div>
        <div class="seg" id="range-seg">
          <button data-r="30" class="on">30 d</button><button data-r="90">90 d</button><button data-r="365">1 año</button>
        </div>
      </div>
      <div class="chart" id="daily-chart"></div>
    </div>
    <div class="panel">
      <div class="panel-head"><div><h3>Por modelo</h3><div class="muted small">Coste total acumulado</div></div></div>
      <div id="provider-split"></div>
      <div id="model-bars"></div>
    </div>
  </section>

  <section class="panel">
    <div class="panel-head">
      <div><h3>Coste mensual por modelo</h3><div class="muted small">Últimos 12 meses</div></div>
      <div class="legend" id="month-legend"></div>
    </div>
    <div class="chart" id="month-chart"></div>
  </section>

  <section class="block">
    <div class="tabs" role="tablist">
      <button class="tab on" data-tab="proyectos" role="tab">Proyectos</button>
      <button class="tab" data-tab="modelos" role="tab">Modelos</button>
      <button class="tab" data-tab="meses" role="tab">Meses</button>
    </div>
    <div class="pane on" id="pane-proyectos">
      <div class="toolbar">
        <input id="proj-search" type="search" placeholder="Buscar proyecto…" aria-label="Buscar proyecto">
        <span class="muted small" id="proj-count"></span>
      </div>
      <div class="table-wrap"><table id="proj-table"></table></div>
    </div>
    <div class="pane" id="pane-modelos"><div class="table-wrap"><table id="model-table"></table></div></div>
    <div class="pane" id="pane-meses"><div id="months"></div></div>
  </section>

  <section class="block">
    <div class="block-head">
      <h2>Herramientas de la casa</h2>
      <span class="muted">Para gastar menos tokens y trabajar mejor con agentes</span>
    </div>
    <div class="tools" id="tools"></div>
  </section>

  <footer class="foot" id="foot"></footer>
</main>

<div class="tooltip" id="tt" role="status"></div>

<script>window.DATA = ${payload};</script>
<script>${CLIENT_JS}</script>
</body>
</html>`;
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const CSS = `
:root {
  color-scheme: light;
  --brand: #FF7900; --brand-ink: #CC5F00; --brand-soft: rgba(255,121,0,.12);
  --bg: #F4F4F2; --surface: #FFFFFF; --surface-2: #F8F8F6; --line: #E4E3DF; --line-2: #EEEDEA;
  --text: #0B0B0B; --text-2: #52514E; --text-3: #8A8984;
  --good: #1B8A5A; --warn: #B26B00;
  --s1:#2a78d6; --s2:#eb6834; --s3:#1baf7a; --s4:#eda100; --s5:#e87ba4; --s6:#008300; --s7:#4a3aa7; --s8:#e34948;
  --shadow: 0 1px 2px rgba(0,0,0,.04), 0 4px 16px rgba(0,0,0,.04);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --brand-ink: #FF9A40; --brand-soft: rgba(255,121,0,.16);
    --bg: #0A0A0A; --surface: #151515; --surface-2: #1C1C1B; --line: #2A2A28; --line-2: #222220;
    --text: #FFFFFF; --text-2: #C3C2B7; --text-3: #85847D;
    --good: #3CC48A; --warn: #F0A52B;
    --s1:#3987e5; --s2:#d95926; --s3:#199e70; --s4:#c98500; --s5:#d55181; --s6:#008300; --s7:#9085e9; --s8:#e66767;
    --shadow: none;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --brand-ink: #FF9A40; --brand-soft: rgba(255,121,0,.16);
  --bg: #0A0A0A; --surface: #151515; --surface-2: #1C1C1B; --line: #2A2A28; --line-2: #222220;
  --text: #FFFFFF; --text-2: #C3C2B7; --text-3: #85847D;
  --good: #3CC48A; --warn: #F0A52B;
  --s1:#3987e5; --s2:#d95926; --s3:#199e70; --s4:#c98500; --s5:#d55181; --s6:#008300; --s7:#9085e9; --s8:#e66767;
  --shadow: none;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: "Helvetica Neue", Helvetica, -apple-system, "Segoe UI", Arial, sans-serif;
  background: var(--bg); color: var(--text); font-size: 14px; line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
code { font-family: ui-monospace, "Cascadia Code", Consolas, monospace; font-size: .92em; background: var(--surface-2); border: 1px solid var(--line); padding: 0 5px; border-radius: 4px; }
button { font: inherit; color: inherit; }
.num { font-variant-numeric: tabular-nums; }
.muted { color: var(--text-2); } .small { font-size: 12px; } .faint { color: var(--text-3); }

/* Topbar */
.top { position: sticky; top: 0; z-index: 20; height: 60px; padding: 0 28px; display: flex; align-items: center; justify-content: space-between;
  background: #000; color: #fff; border-bottom: 3px solid var(--brand); }
.top-l, .top-r { display: flex; align-items: center; gap: 12px; }
.logo { width: 34px; height: 34px; display: flex; } .logo svg { width: 34px; height: 34px; }
.logo-sq { width: 34px; height: 34px; background: var(--brand); display: block; }
.top-title { font-weight: 700; font-size: 16px; letter-spacing: -.01em; }
.top-sub { font-size: 12px; color: #A5A5A5; }
.pill { font-size: 11px; font-weight: 700; letter-spacing: .08em; padding: 4px 10px; background: var(--brand); color: #000; }
.btn { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 12px; cursor: pointer;
  background: transparent; border: 1px solid #3A3A3A; color: #fff; font-size: 13px; font-weight: 600; transition: border-color .15s, background .15s; }
.btn:hover { border-color: var(--brand); background: rgba(255,121,0,.1); }
.btn.icon { width: 34px; padding: 0; justify-content: center; }
.btn:focus-visible, .tab:focus-visible, .seg button:focus-visible, input:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }

.wrap { max-width: 1180px; margin: 0 auto; padding: 28px 28px 56px; display: flex; flex-direction: column; gap: 22px; }

/* Banners */
.banner { padding: 12px 16px; border-left: 4px solid var(--brand); background: var(--surface); box-shadow: var(--shadow); font-size: 13px; color: var(--text-2); }
.banner strong { color: var(--text); }
.banner.warn { border-left-color: var(--warn); }

/* Hero */
.hero { display: grid; grid-template-columns: minmax(280px, 1.1fr) 2fr; gap: 16px; }
.hero-main { background: #000; color: #fff; padding: 24px 26px; display: flex; flex-direction: column; gap: 6px; position: relative; overflow: hidden; }
.hero-main::after { content: ""; position: absolute; right: 0; top: 0; width: 64px; height: 64px; background: var(--brand); }
.eyebrow { font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #A5A5A5; }
.hero-num { font-size: 52px; font-weight: 700; letter-spacing: -.03em; line-height: 1.05; font-variant-numeric: tabular-nums; }
.hero-meta { font-size: 13px; color: #C9C9C9; display: flex; flex-wrap: wrap; gap: 4px 14px; }
.hero-meta b { color: #fff; }
.delta-up { color: #FF9A40; } .delta-down { color: #3CC48A; }
.progress { margin-top: auto; padding-top: 14px; }
.progress-track { height: 6px; background: #2A2A2A; position: relative; }
.progress-fill { position: absolute; inset: 0 auto 0 0; background: var(--brand); }
.progress-proj { position: absolute; top: -3px; width: 2px; height: 12px; background: #fff; }
.progress-lbl { display: flex; justify-content: space-between; font-size: 11px; color: #A5A5A5; margin-top: 6px; }
.tiles { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
.tile { background: var(--surface); box-shadow: var(--shadow); border: 1px solid var(--line-2); padding: 18px 20px; display: flex; flex-direction: column; gap: 4px; }
.tile-lbl { font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--text-3); }
.tile-num { font-size: 26px; font-weight: 700; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.tile-sub { font-size: 12px; color: var(--text-2); }

/* Blocks / panels */
.block { display: flex; flex-direction: column; gap: 12px; }
.block-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
h2 { font-size: 20px; font-weight: 700; letter-spacing: -.02em; }
h3 { font-size: 15px; font-weight: 700; }
.panel { background: var(--surface); border: 1px solid var(--line-2); box-shadow: var(--shadow); padding: 18px 20px; }
.panel-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
.grid2 { display: grid; grid-template-columns: 1.6fr 1fr; gap: 16px; }

/* Tips */
.tips { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
.tip { background: var(--surface); border: 1px solid var(--line-2); box-shadow: var(--shadow); padding: 16px 18px; display: flex; flex-direction: column; gap: 8px; position: relative; }
.tip::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--text-3); }
.tip.save::before { background: var(--good); } .tip.tool::before { background: var(--brand); }
.tip-top { display: flex; align-items: center; gap: 8px; }
.tag { font-size: 10.5px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; padding: 2px 7px; background: var(--surface-2); color: var(--text-2); border: 1px solid var(--line); }
.tag.save { color: var(--good); } .tag.tool { color: var(--brand-ink); border-color: var(--brand); background: var(--brand-soft); }
.tag.on { color: var(--good); }
.tip h4 { font-size: 15px; font-weight: 700; line-height: 1.3; }
.tip p { color: var(--text-2); font-size: 13px; }
.tip-metric { display: flex; align-items: baseline; gap: 6px; }
.tip-metric b { font-size: 22px; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.tip-cta { display: flex; gap: 8px; flex-wrap: wrap; margin-top: auto; padding-top: 4px; }
.cta { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; font-size: 12px; font-weight: 600; cursor: pointer; text-decoration: none;
  border: 1px solid var(--line); background: var(--surface-2); color: var(--text); }
.cta:hover { border-color: var(--brand); }
.cta.primary { background: var(--brand); border-color: var(--brand); color: #000; }
.cta code { background: none; border: 0; padding: 0; }

/* Segmented control */
.seg { display: inline-flex; border: 1px solid var(--line); }
.seg button { border: 0; background: transparent; padding: 5px 10px; font-size: 12px; font-weight: 600; color: var(--text-2); cursor: pointer; }
.seg button.on { background: var(--text); color: var(--surface); }

/* Charts */
.chart { position: relative; width: 100%; }
.chart svg { display: block; width: 100%; height: auto; overflow: visible; }
.axis text { fill: var(--text-3); font-size: 11px; }
.grid-line { stroke: var(--line-2); stroke-width: 1; }
.base-line { stroke: var(--line); stroke-width: 1; }
.hit { fill: transparent; cursor: default; }
.hit:hover + .bar, .bar.hl { opacity: .75; }
.legend { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12px; color: var(--text-2); }
.legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: -1px; }
.psplit { margin-bottom: 14px; }
.psplit-bar { display: flex; height: 10px; gap: 2px; }
.psplit-bar span { display: block; height: 10px; }
.psplit-bar span:last-child { border-radius: 0 4px 4px 0; }
.psplit-leg { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 8px; font-size: 12px; color: var(--text-2); }
.psplit-leg i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: -1px; }
.psplit-leg b { color: var(--text); font-variant-numeric: tabular-nums; }
.mbar { display: grid; grid-template-columns: 110px 1fr auto; gap: 10px; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--line-2); }
.mbar:last-child { border-bottom: 0; }
.mbar-name { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mbar-track { height: 8px; background: var(--surface-2); }
.mbar-fill { height: 8px; border-radius: 0 4px 4px 0; }
.mbar-val { font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; text-align: right; min-width: 80px; }
.tooltip { position: fixed; pointer-events: none; z-index: 50; background: #000; color: #fff; padding: 8px 10px; font-size: 12px; line-height: 1.45;
  border-top: 2px solid var(--brand); box-shadow: 0 6px 24px rgba(0,0,0,.25); opacity: 0; transform: translateY(4px); transition: opacity .1s, transform .1s; max-width: 260px; }
.tooltip.on { opacity: 1; transform: none; }
.tooltip .tt-h { font-weight: 700; margin-bottom: 2px; }
.tooltip .tt-r { display: flex; justify-content: space-between; gap: 14px; font-variant-numeric: tabular-nums; }
.tooltip i { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 6px; }

/* Tabs / tables */
.tabs { display: flex; gap: 2px; border-bottom: 2px solid var(--line); }
.tab { border: 0; background: transparent; padding: 10px 18px; font-size: 14px; font-weight: 700; color: var(--text-3); cursor: pointer; margin-bottom: -2px; border-bottom: 2px solid transparent; }
.tab:hover { color: var(--text); } .tab.on { color: var(--text); border-bottom-color: var(--brand); }
.pane { display: none; } .pane.on { display: block; }
.toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
input[type=search] { height: 36px; width: 100%; max-width: 320px; padding: 0 12px; background: var(--surface); border: 1px solid var(--line); color: var(--text); font: inherit; }
.table-wrap { background: var(--surface); border: 1px solid var(--line-2); box-shadow: var(--shadow); overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--text-3); padding: 10px 14px; border-bottom: 1px solid var(--line); white-space: nowrap; background: var(--surface-2); }
th.sort { cursor: pointer; user-select: none; } th.sort:hover { color: var(--text); }
th.sort[aria-sort=ascending]::after { content: " ↑"; color: var(--brand); } th.sort[aria-sort=descending]::after { content: " ↓"; color: var(--brand); }
td { padding: 10px 14px; border-bottom: 1px solid var(--line-2); font-size: 13px; vertical-align: middle; }
tr:last-child td { border-bottom: 0; } tbody tr:hover td { background: var(--surface-2); }
.r { text-align: right; } .strong { font-weight: 700; }
.cell-bar { width: 140px; height: 6px; background: var(--surface-2); } .cell-bar span { display: block; height: 6px; background: var(--brand); border-radius: 0 3px 3px 0; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.chip { font-size: 11px; padding: 1px 6px; background: var(--surface-2); border: 1px solid var(--line); color: var(--text-2); white-space: nowrap; }
.status { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--text-3); margin-left: 6px; }
.status.current { color: var(--good); }

/* Months */
.month { background: var(--surface); border: 1px solid var(--line-2); box-shadow: var(--shadow); margin-bottom: 10px; }
.month > button { width: 100%; display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border: 0; background: transparent; cursor: pointer; font-size: 14px; font-weight: 700; }
.month > button:hover { background: var(--surface-2); }
.month .chev { display: inline-block; transition: transform .15s; margin-right: 8px; color: var(--text-3); }
.month.closed .chev { transform: rotate(-90deg); } .month.closed .month-body { display: none; }
.month-body { border-top: 1px solid var(--line-2); }

/* Tools */
.tools { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px; }
.toolc { background: var(--surface); border: 1px solid var(--line-2); box-shadow: var(--shadow); padding: 16px; display: flex; flex-direction: column; gap: 8px; }
.toolc-h { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.toolc-name { font-weight: 700; font-size: 15px; display: flex; align-items: center; gap: 8px; }
.toolc-name::before { content: ""; width: 10px; height: 10px; background: var(--brand); }
.toolc-tag { font-size: 12px; color: var(--text-2); font-weight: 600; }
.toolc p { font-size: 13px; color: var(--text-2); }

.foot { font-size: 12px; color: var(--text-3); border-top: 1px solid var(--line); padding-top: 16px; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; }
.foot a { color: inherit; }
.empty { padding: 28px; text-align: center; color: var(--text-3); }

@media (max-width: 900px) {
  .hero, .grid2 { grid-template-columns: 1fr; }
}
@media (max-width: 600px) {
  .top { padding: 0 16px; } .top-sub { display: none; }
  .wrap { padding: 18px 16px 40px; }
  .hero-num { font-size: 40px; }
  .tiles { grid-template-columns: 1fr 1fr; gap: 10px; } .tile { padding: 14px; } .tile-num { font-size: 20px; }
  .tips { grid-template-columns: 1fr; }
  .mbar { grid-template-columns: 84px 1fr auto; }
  .cell-bar { width: 70px; }
  .tab { padding: 10px 12px; }
}
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
`;

// ─── Cliente ──────────────────────────────────────────────────────────────────
const CLIENT_JS = String.raw`
(function () {
  const D = window.DATA;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const MON = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const pre = D.plan ? '~' : '';
  const PROV = { anthropic: ['Claude', 'var(--brand)'], openai: ['OpenAI', 'var(--s1)'], google: ['Gemini', 'var(--s3)'] };
  const usd = (n, d) => {
    if (d == null) d = Math.abs(n) >= 100 ? 0 : 2;
    return pre + '$' + n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  };
  const usd4 = n => pre + '$' + n.toLocaleString('en-US', { minimumFractionDigits: n < 1 ? 4 : 2, maximumFractionDigits: n < 1 ? 4 : 2 });
  const tok = n => n >= 1e9 ? (n/1e9).toFixed(2) + 'B' : n >= 1e6 ? (n/1e6).toFixed(1) + 'M' : n >= 1e3 ? (n/1e3).toFixed(1) + 'K' : String(Math.round(n));
  const monthLbl = k => { const [y, m] = k.split('-'); return MON[+m - 1] + ' ' + y; };
  const monthShort = k => MON[+k.split('-')[1] - 1];
  const parseDay = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const dayKey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

  // ── Tema ───────────────────────────────────────────────────────────────────
  const savedTheme = store.get('cut-theme');
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  $('#theme-btn').onclick = () => {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    store.set('cut-theme', next);
  };

  // ── Colores por modelo: siguen a la entidad (orden de coste total), nunca al rango del gráfico ──
  const SLOTS = 8;
  const colorOf = {};
  D.models.forEach((m, i) => { colorOf[m.id] = i < SLOTS - 1 ? 'var(--s' + (i + 1) + ')' : 'var(--s8)'; });
  const nameOf = Object.fromEntries(D.models.map(m => [m.id, m.name]));
  const OTHER = '__other';
  const topIds = D.models.slice(0, SLOTS - 1).map(m => m.id);
  const groupId = id => topIds.includes(id) ? id : OTHER;
  nameOf[OTHER] = 'Otros'; colorOf[OTHER] = 'var(--s8)';

  // ── Tooltip ────────────────────────────────────────────────────────────────
  const tt = $('#tt');
  function showTT(html, ev) {
    tt.innerHTML = html; tt.classList.add('on');
    const r = tt.getBoundingClientRect();
    let x = ev.clientX + 14, y = ev.clientY - r.height - 12;
    if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - 14;
    if (y < 8) y = ev.clientY + 16;
    tt.style.left = x + 'px'; tt.style.top = y + 'px';
  }
  const hideTT = () => tt.classList.remove('on');

  // ── Cabecera ───────────────────────────────────────────────────────────────
  const gen = new Date(D.generatedAt);
  $('#top-sub').textContent = 'Orange — Monitorización de uso' + (D.providers.length > 1 ? ' · ' + D.providers.map(p => (PROV[p.id] || [p.id])[0]).join(', ') : '') + ' · ' + gen.toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
  $('#mode-pill').textContent = D.plan ? 'PLAN' : 'API';

  const banners = [];
  if (D.plan) banners.push('<div class="banner">Modo <strong>Plan</strong>: los importes son el equivalente estimado en precios de API. Con suscripción Max/Pro no se cobra por token.</div>');
  if (D.unknownModels.length) banners.push('<div class="banner warn"><strong>Modelos sin precio conocido:</strong> ' + D.unknownModels.map(esc).join(', ') + '. Se estiman con el modelo más reciente de su familia; actualiza el tracker.</div>');
  $('#banners').innerHTML = banners.join('');

  // ── Hero: mes actual + proyección ─────────────────────────────────────────
  const now = new Date(D.generatedAt);
  const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dom = now.getDate();
  const proj = dom ? D.monthCost / dom * dim : 0;
  const prevKey = (() => { const d = new Date(now.getFullYear(), now.getMonth() - 1, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); })();
  const prev = (D.months.find(m => m.key === prevKey) || { cost: 0 }).cost;
  // Mismo tramo del mes anterior (días 1..dom) para comparar peras con peras
  let prevSame = 0;
  for (const [k, v] of Object.entries(D.days)) if (k.startsWith(prevKey) && +k.slice(8) <= dom) prevSame += v;
  $('#hero-label').textContent = 'Este mes · ' + monthLbl(D.thisMonth);
  $('#hero-num').textContent = usd(D.monthCost, 2);
  const meta = ['Previsión <b>' + usd(proj) + '</b>'];
  if (prevSame > 0) {
    const pct = (D.monthCost - prevSame) / prevSame * 100;
    meta.push('<span class="' + (pct > 0 ? 'delta-up' : 'delta-down') + '">' + (pct > 0 ? '▲ ' : '▼ ') + Math.abs(pct).toFixed(0) + ' %</span> vs. mismo tramo de ' + monthLbl(prevKey).split(' ')[0]);
  }
  if (prev > 0) meta.push(monthLbl(prevKey).split(' ')[0] + ' completo: <b>' + usd(prev) + '</b>');
  $('#hero-meta').innerHTML = meta.map(x => '<span>' + x + '</span>').join('');
  const scale = Math.max(proj, D.monthCost, 1);
  $('#hero-progress').innerHTML = '<div class="progress-track"><div class="progress-fill" style="width:' + (D.monthCost / scale * 100).toFixed(1) + '%"></div>'
    + '<div class="progress-proj" style="left:calc(' + (dom / dim * 100).toFixed(1) + '% - 1px)" title="Hoy"></div></div>'
    + '<div class="progress-lbl"><span>Día ' + dom + ' de ' + dim + '</span><span>Previsión ' + usd(proj) + '</span></div>';

  const tk = D.totals.tok;
  const hit = tk.cacheRead / Math.max(1, tk.input + tk.cacheRead + tk.cacheWrite);
  const since = D.firstTs ? new Date(D.firstTs).toLocaleDateString('es-ES', { month: 'short', year: 'numeric' }) : '—';
  const tiles = [
    ['Hoy', usd(D.todayTot.cost, 2), D.todayTot.requests + ' peticiones · ' + tok(D.todayTot.tok.output) + ' tokens de salida'],
    ['Total acumulado', usd(D.totals.cost), 'Desde ' + since + ' · ' + D.totals.requests.toLocaleString('es-ES') + ' peticiones'],
    ['Ahorro por caché', usd(D.totals.savings), (hit * 100).toFixed(0) + ' % de la entrada sale de la caché'],
    ['Tokens procesados', tok(tk.input + tk.cacheRead + tk.cacheWrite + tk.output), tok(tk.output) + ' de salida · ' + tok(tk.cacheRead) + ' de caché'],
  ];
  $('#tiles').innerHTML = tiles.map(t => '<div class="tile"><div class="tile-lbl">' + t[0] + '</div><div class="tile-num">' + t[1] + '</div><div class="tile-sub">' + t[2] + '</div></div>').join('');

  // ── Consejos ───────────────────────────────────────────────────────────────
  const toolsById = Object.fromEntries(D.insights.tools.map(t => [t.id, t]));
  const fmtMetric = m => m.unit === 'usd' ? usd(m.value) : m.unit === 'tokens' ? tok(m.value) : m.value.toLocaleString('es-ES');
  const tagFor = t => t.tone === 'save' ? '<span class="tag save">Ahorro</span>'
    : t.tool ? (t.active ? '<span class="tag on">✓ ' + esc(t.tool) + ' activo</span>' : '<span class="tag tool">' + esc(t.tool) + '</span>')
    : '<span class="tag">Info</span>';
  const copyBtn = cmd => '<button class="cta" data-copy="' + esc(cmd) + '"><code>' + esc(cmd) + '</code><span class="faint">copiar</span></button>';
  $('#tips').innerHTML = D.insights.tips.map(t => {
    const tool = t.tool && toolsById[t.tool];
    const cta = tool && !t.active
      ? (tool.install ? copyBtn(tool.install) : '') + '<a class="cta' + (tool.install ? '' : ' primary') + '" href="' + esc(tool.url) + '" target="_blank" rel="noopener">Ver ' + esc(tool.name) + ' ↗</a>'
      : '';
    return '<article class="tip ' + t.tone + '"><div class="tip-top">' + tagFor(t) + '</div><h4>' + esc(t.title) + '</h4><p>' + t.body + '</p>'
      + (t.metric ? '<div class="tip-metric"><b>' + fmtMetric(t.metric) + '</b><span class="muted small">' + esc(t.metric.label)
        + (t.metric.usd ? ' · ≈ ' + usd(t.metric.usd, 2) : '') + '</span></div>' : '')
      + (cta ? '<div class="tip-cta">' + cta + '</div>' : '') + '</article>';
  }).join('');
  $('#tips-sub').textContent = 'Calculados con tu uso real';

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-copy]');
    if (!b) return;
    const txt = b.dataset.copy;
    const done = () => { const f = b.querySelector('.faint'); if (f) { f.textContent = 'copiado ✓'; setTimeout(() => f.textContent = 'copiar', 1400); } };
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done, done); else done();
  });

  // ── Gráfico de barras genérico (SVG) ──────────────────────────────────────
  // series: [{ key, label, stacks: [{ id, value }] }]
  function barChart(el, series, opts) {
    const W = el.clientWidth || 700, H = opts.height || 220;
    const m = { t: 10, r: 8, b: 26, l: 48 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const max = Math.max(0.01, ...series.map(s => s.stacks.reduce((a, x) => a + x.value, 0)));
    const nice = (() => { const p = Math.pow(10, Math.floor(Math.log10(max))); const f = max / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; })();
    const y = v => ih - v / nice * ih;
    const bw = iw / series.length;
    const gap = Math.min(bw * 0.28, 8);
    const ticks = [0, .25, .5, .75, 1].map(f => f * nice);
    let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opts.label) + '"><g transform="translate(' + m.l + ',' + m.t + ')">';
    svg += '<g class="axis">' + ticks.map(t => '<line class="grid-line" x1="0" x2="' + iw + '" y1="' + y(t) + '" y2="' + y(t) + '"/><text x="-8" y="' + (y(t) + 4) + '" text-anchor="end">' + (t >= 1000 ? '$' + (t/1000).toFixed(t % 1000 ? 1 : 0) + 'K' : '$' + (t < 1 && t > 0 ? t.toFixed(2) : Math.round(t))) + '</text>').join('') + '</g>';
    const every = Math.ceil(series.length / Math.max(1, Math.floor(iw / 46)));
    series.forEach((s, i) => {
      const w = Math.max(1, Math.min(bw - gap, opts.maxBar || 56)), x = i * bw + (bw - w) / 2;
      let acc = 0;
      const total = s.stacks.reduce((a, b) => a + b.value, 0);
      const segs = s.stacks.filter(st => st.value > 0);
      segs.forEach((st, j) => {
        const h = st.value / nice * ih;
        const top = y(acc + st.value);
        const isTop = j === segs.length - 1;
        const hh = Math.max(0, h - (isTop ? 0 : 2));
        const r = isTop ? Math.min(4, w / 2, hh) : 0;
        const fill = st.color || 'var(--brand)';
        svg += r > 0
          ? '<path class="bar" fill="' + fill + '" d="M' + x + ',' + (top + hh) + 'V' + (top + r) + 'Q' + x + ',' + top + ' ' + (x + r) + ',' + top + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + top + ' ' + (x + w) + ',' + (top + r) + 'V' + (top + hh) + 'Z"/>'
          : '<rect class="bar" fill="' + fill + '" x="' + x + '" y="' + top + '" width="' + w + '" height="' + hh + '"/>';
        acc += st.value;
      });
      svg += '<rect class="hit" data-i="' + i + '" x="' + (i * bw) + '" y="0" width="' + bw + '" height="' + ih + '"/>';
      if (i % every === 0 || i === series.length - 1 && series.length < 20) svg += '<text class="axis" x="' + (x + w / 2) + '" y="' + (ih + 18) + '" text-anchor="middle" style="fill:var(--text-3);font-size:11px">' + esc(s.label) + '</text>';
      s._total = total;
    });
    svg += '<line class="base-line" x1="0" x2="' + iw + '" y1="' + ih + '" y2="' + ih + '"/></g></svg>';
    el.innerHTML = svg;
    el.querySelectorAll('.hit').forEach(h => {
      const s = series[+h.dataset.i];
      h.addEventListener('mousemove', ev => showTT(opts.tooltip(s), ev));
      h.addEventListener('mouseleave', hideTT);
    });
  }

  // ── Gasto diario ──────────────────────────────────────────────────────────
  let range = +(store.get('cut-range') || 30);
  function drawDaily() {
    const days = [];
    const end = parseDay(D.today);
    if (range <= 90) {
      for (let i = range - 1; i >= 0; i--) {
        const d = new Date(end); d.setDate(d.getDate() - i);
        const k = dayKey(d);
        days.push({ key: k, label: d.getDate() === 1 || i === range - 1 ? d.getDate() + ' ' + MON[d.getMonth()] : String(d.getDate()), stacks: [{ value: D.days[k] || 0 }] });
      }
    } else {
      // 1 año → semanas
      for (let i = 51; i >= 0; i--) {
        const d = new Date(end); d.setDate(d.getDate() - i * 7 - 6);
        let v = 0;
        for (let j = 0; j < 7; j++) { const dd = new Date(d); dd.setDate(d.getDate() + j); v += D.days[dayKey(dd)] || 0; }
        days.push({ key: dayKey(d), label: d.getDate() <= 7 ? MON[d.getMonth()] : '', week: true, stacks: [{ value: v }] });
      }
    }
    const sum = days.reduce((a, d) => a + d.stacks[0].value, 0);
    const active = days.filter(d => d.stacks[0].value > 0).length;
    $('#daily-sub').textContent = usd(sum) + ' en ' + (range <= 90 ? range + ' días' : '12 meses') + ' · media ' + usd(sum / Math.max(1, active), 2) + (range <= 90 ? ' por día activo' : ' por semana activa');
    barChart($('#daily-chart'), days, {
      label: 'Gasto diario', height: 220,
      tooltip: s => '<div class="tt-h">' + (s.week ? 'Semana del ' : '') + parseDay(s.key).toLocaleDateString('es-ES', { weekday: s.week ? undefined : 'short', day: 'numeric', month: 'short' }) + '</div><div class="tt-r"><span>Coste</span><b>' + usd4(s._total) + '</b></div>',
    });
    document.querySelectorAll('#range-seg button').forEach(b => b.classList.toggle('on', +b.dataset.r === range));
  }
  document.querySelectorAll('#range-seg button').forEach(b => b.onclick = () => { range = +b.dataset.r; store.set('cut-range', range); drawDaily(); });

  // ── Reparto por proveedor (solo si hay más de uno) ────────────────────────
  if (D.providers.length > 1) {
    const tot = D.providers.reduce((a, p) => a + p.cost, 0) || 1;
    $('#provider-split').innerHTML = '<div class="psplit"><div class="psplit-bar" role="img" aria-label="Reparto del coste por proveedor">'
      + D.providers.map(p => '<span style="width:' + (p.cost / tot * 100).toFixed(2) + '%;background:' + (PROV[p.id] || [p.id, 'var(--s8)'])[1] + '"></span>').join('') + '</div>'
      + '<div class="psplit-leg">' + D.providers.map(p => '<span><i style="background:' + (PROV[p.id] || [p.id, 'var(--s8)'])[1] + '"></i>' + esc((PROV[p.id] || [p.id])[0]) + ' <b>' + usd(p.cost) + '</b> · ' + (p.cost / tot * 100).toFixed(0) + '%</span>').join('') + '</div></div>';
  }

  // ── Barras por modelo ─────────────────────────────────────────────────────
  const maxModel = Math.max(0.01, ...D.models.map(m => m.cost));
  $('#model-bars').innerHTML = D.models.length ? D.models.map(m =>
    '<div class="mbar" data-model="' + esc(m.id) + '"><div class="mbar-name" title="' + esc(m.id) + '">' + esc(m.name) + '</div>'
    + '<div class="mbar-track"><div class="mbar-fill" style="width:' + (m.cost / maxModel * 100).toFixed(1) + '%;background:' + colorOf[m.id] + '"></div></div>'
    + '<div class="mbar-val">' + usd(m.cost) + ' <span class="faint small">' + (m.cost / Math.max(1e-9, D.totals.cost) * 100).toFixed(0) + '%</span></div></div>'
  ).join('') : '<div class="empty">Sin datos</div>';
  document.querySelectorAll('.mbar').forEach(el => {
    const m = D.models.find(x => x.id === el.dataset.model);
    el.addEventListener('mousemove', ev => showTT('<div class="tt-h">' + esc(m.name) + '</div>'
      + '<div class="tt-r"><span>Coste</span><b>' + usd4(m.cost) + '</b></div>'
      + '<div class="tt-r"><span>Peticiones</span><b>' + m.requests.toLocaleString('es-ES') + '</b></div>'
      + '<div class="tt-r"><span>Salida</span><b>' + tok(m.output) + '</b></div>'
      + '<div class="tt-r"><span>Caché lect.</span><b>' + tok(m.cacheRead) + '</b></div>', ev));
    el.addEventListener('mouseleave', hideTT);
  });

  // ── Coste mensual apilado por modelo ──────────────────────────────────────
  function drawMonthly() {
    const last = D.months.slice(-12);
    const order = [...topIds, OTHER];
    const series = last.map(mo => {
      const grouped = {};
      for (const [id, c] of Object.entries(mo.models)) { const g = groupId(id); grouped[g] = (grouped[g] || 0) + c; }
      return { key: mo.key, label: monthShort(mo.key) + (mo.key.endsWith('-01') ? " '" + mo.key.slice(2, 4) : ''), grouped,
        stacks: order.filter(g => grouped[g]).map(g => ({ id: g, value: grouped[g], color: colorOf[g] })) };
    });
    const used = order.filter(g => series.some(s => s.grouped[g]));
    $('#month-legend').innerHTML = used.length > 1 ? used.map(g => '<span><i style="background:' + colorOf[g] + '"></i>' + esc(nameOf[g]) + '</span>').join('') : '';
    if (!series.length) { $('#month-chart').innerHTML = '<div class="empty">Sin datos</div>'; return; }
    barChart($('#month-chart'), series, {
      label: 'Coste mensual por modelo', height: 240,
      tooltip: s => '<div class="tt-h">' + monthLbl(s.key) + ' · ' + usd(s._total, 2) + '</div>'
        + [...s.stacks].reverse().map(st => '<div class="tt-r"><span><i style="background:' + st.color + '"></i>' + esc(nameOf[st.id]) + '</span><b>' + usd(st.value, 2) + '</b></div>').join(''),
    });
  }

  // ── Tablas ordenables ─────────────────────────────────────────────────────
  function table(el, cols, rows, initial) {
    let sortKey = initial, dir = -1;
    function render() {
      const sorted = [...rows].sort((a, b) => {
        const av = cols[sortKey].v(a), bv = cols[sortKey].v(b);
        return (typeof av === 'string' ? av.localeCompare(bv) : av - bv) * dir;
      });
      el.innerHTML = '<thead><tr>' + cols.map((c, i) => '<th class="sort' + (c.r ? ' r' : '') + '" data-i="' + i + '"' + (i === sortKey ? ' aria-sort="' + (dir < 0 ? 'descending' : 'ascending') + '"' : '') + '>' + c.h + '</th>').join('') + '</tr></thead>'
        + '<tbody>' + sorted.map(r => '<tr data-name="' + esc((r.name || '').toLowerCase()) + '">' + cols.map(c => '<td' + (c.r ? ' class="r num"' : '') + '>' + c.f(r) + '</td>').join('') + '</tr>').join('') + '</tbody>';
      el.querySelectorAll('th').forEach(th => th.onclick = () => {
        const i = +th.dataset.i;
        dir = i === sortKey ? -dir : (typeof cols[i].v(rows[0] || {}) === 'string' ? 1 : -1);
        sortKey = i; render(); filterProjects();
      });
    }
    render();
  }

  const maxProj = Math.max(0.01, ...D.projects.map(p => p.cost));
  const ago = iso => {
    if (!iso) return '—';
    const days = Math.floor((now - new Date(iso)) / 864e5);
    return days <= 0 ? 'hoy' : days === 1 ? 'ayer' : 'hace ' + days + ' días';
  };
  table($('#proj-table'), [
    { h: 'Proyecto', v: r => r.name.toLowerCase(), f: r => '<div class="strong">' + esc(r.name) + '</div><div class="chips">' + r.models.slice(0, 4).map(([n, c]) => '<span class="chip">' + esc(n) + ' ' + usd(c) + '</span>').join('') + '</div>' },
    { h: D.plan ? 'Equiv. estimado' : 'Coste', r: 1, v: r => r.cost, f: r => '<b>' + usd(r.cost, 2) + '</b>' },
    { h: '%', r: 1, v: r => r.cost, f: r => (r.cost / Math.max(1e-9, D.totals.cost) * 100).toFixed(1) + '%' },
    { h: '', v: r => r.cost, f: r => '<div class="cell-bar"><span style="width:' + (r.cost / maxProj * 100).toFixed(1) + '%"></span></div>' },
    { h: 'Sesiones', r: 1, v: r => r.sessions, f: r => r.sessions },
    { h: 'Tokens', r: 1, v: r => r.tokens, f: r => tok(r.tokens) },
    { h: 'Último uso', r: 1, v: r => r.lastUsed || '', f: r => '<span class="muted">' + ago(r.lastUsed) + '</span>' },
  ], D.projects, 1);
  function filterProjects() {
    const q = ($('#proj-search').value || '').toLowerCase().trim();
    let n = 0;
    document.querySelectorAll('#proj-table tbody tr').forEach(tr => { const ok = !q || tr.dataset.name.includes(q); tr.style.display = ok ? '' : 'none'; if (ok) n++; });
    $('#proj-count').textContent = n + ' de ' + D.projects.length + ' proyectos';
  }
  $('#proj-search').addEventListener('input', filterProjects);
  filterProjects();

  const STATUS = { current: 'actual', legacy: 'anterior', deprecated: 'obsoleto', retired: 'retirado' };
  table($('#model-table'), [
    { h: 'Modelo', v: r => r.name.toLowerCase(), f: r => '<span style="display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:8px;background:' + colorOf[r.id] + '"></span><b>' + esc(r.name) + '</b>'
        + (r.estimated ? '<span class="status">estimado</span>' : '<span class="status ' + r.status + '">' + (STATUS[r.status] || '') + '</span>') + '<div class="faint small">' + esc(r.id) + '</div>' },
    ...(D.providers.length > 1 ? [{ h: 'Proveedor', v: r => r.provider, f: r => esc((PROV[r.provider] || [r.provider])[0]) }] : []),
    { h: D.plan ? 'Equiv. estimado' : 'Coste', r: 1, v: r => r.cost, f: r => '<b>' + usd(r.cost, 2) + '</b>' },
    { h: 'Peticiones', r: 1, v: r => r.requests, f: r => r.requests.toLocaleString('es-ES') },
    { h: 'Entrada', r: 1, v: r => r.input, f: r => tok(r.input) },
    { h: 'Caché escr.', r: 1, v: r => r.cacheWrite, f: r => tok(r.cacheWrite) },
    { h: 'Caché lect.', r: 1, v: r => r.cacheRead, f: r => tok(r.cacheRead) },
    { h: 'Salida', r: 1, v: r => r.output, f: r => tok(r.output) },
    { h: '$ / petición', r: 1, v: r => r.cost / Math.max(1, r.requests), f: r => usd4(r.cost / Math.max(1, r.requests)) },
  ], D.models, 1);

  // ── Meses ─────────────────────────────────────────────────────────────────
  const months = [...D.months].reverse();
  $('#months').innerHTML = months.length ? months.map((mo, i) => {
    const max = Math.max(0.01, ...mo.projects.map(p => p.cost));
    return '<div class="month' + (i ? ' closed' : '') + '"><button aria-expanded="' + (!i) + '"><span><span class="chev">▾</span>' + monthLbl(mo.key) + '</span><span class="num">' + usd(mo.cost, 2) + '</span></button>'
      + '<div class="month-body"><table><thead><tr><th>Proyecto</th><th class="r">Coste</th><th class="r">%</th><th></th></tr></thead><tbody>'
      + mo.projects.map(p => '<tr><td><div class="strong">' + esc(p.name) + '</div><div class="chips">' + p.models.slice(0, 4).map(([n, c]) => '<span class="chip">' + esc(n) + ' ' + usd(c) + '</span>').join('') + '</div></td>'
        + '<td class="r num"><b>' + usd(p.cost, 2) + '</b></td><td class="r num">' + (p.cost / Math.max(1e-9, mo.cost) * 100).toFixed(1) + '%</td>'
        + '<td><div class="cell-bar"><span style="width:' + (p.cost / max * 100).toFixed(1) + '%"></span></div></td></tr>').join('')
      + '</tbody></table></div></div>';
  }).join('') : '<div class="empty">Sin datos</div>';
  document.querySelectorAll('.month > button').forEach(b => b.onclick = () => {
    const m = b.parentElement; m.classList.toggle('closed'); b.setAttribute('aria-expanded', !m.classList.contains('closed'));
  });

  // ── Pestañas ──────────────────────────────────────────────────────────────
  function showTab(name) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.tab === name));
    document.querySelectorAll('.pane').forEach(p => p.classList.toggle('on', p.id === 'pane-' + name));
    store.set('cut-tab', name);
  }
  document.querySelectorAll('.tab').forEach(t => t.onclick = () => showTab(t.dataset.tab));
  const savedTab = store.get('cut-tab');
  if (savedTab && document.getElementById('pane-' + savedTab)) showTab(savedTab);

  // ── Herramientas ──────────────────────────────────────────────────────────
  $('#tools').innerHTML = D.insights.tools.map(t => '<div class="toolc"><div class="toolc-h"><span class="toolc-name">' + esc(t.name) + '</span>'
    + (t.active ? '<span class="tag on">✓ Activo</span>' : '') + '</div>'
    + '<div class="toolc-tag">' + esc(t.tagline) + '</div><p>' + esc(t.description) + '</p>'
    + '<div class="tip-cta">' + (t.install && !t.active ? copyBtn(t.install) : '') + '<a class="cta" href="' + esc(t.url) + '" target="_blank" rel="noopener">Abrir ↗</a></div></div>').join('');

  // ── Pie ───────────────────────────────────────────────────────────────────
  $('#foot').innerHTML = '<span>Fuentes: ' + D.sources.map(s => esc(s.label)).join(' · ') + ' · Datos 100 % locales, no se envían a ningún servidor</span>'
    + '<span>Precios oficiales revisados el ' + new Date(D.pricingUpdated).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) + '</span>';

  // ── CSV ───────────────────────────────────────────────────────────────────
  $('#csv-btn').onclick = () => {
    const rows = [['Mes', 'Proyecto', 'Coste USD', 'Tokens']];
    for (const mo of D.months) for (const p of mo.projects) rows.push([mo.key, p.name, p.cost.toFixed(6), p.tokens]);
    rows.push([], ['Modelo', 'ID', 'Coste USD', 'Peticiones', 'Entrada', 'Cache escritura', 'Cache lectura', 'Salida']);
    for (const m of D.models) rows.push([m.name, m.id, m.cost.toFixed(6), m.requests, m.input, m.cacheWrite, m.cacheRead, m.output]);
    rows.push([], ['Día', 'Coste USD']);
    for (const k of Object.keys(D.days).sort()) rows.push([k, D.days[k].toFixed(6)]);
    const csv = rows.map(r => r.map(c => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'claude-usage-' + D.today + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
  };

  drawDaily(); drawMonthly();
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { drawDaily(); drawMonthly(); }, 120); });
})();
`;

module.exports = { renderReport };
