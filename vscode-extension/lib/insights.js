/**
 * insights.js — Consejos a partir del uso real.
 *
 * Cada consejo se apoya en una señal de los logs (lecturas de PDF, sesiones con muchos archivos editados,
 * modelos antiguos...) y, cuando aplica, recomienda una herramienta del ecosistema.
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { costOfUsage, MODELS, resolveModel } = require('./pricing');

// ─── Ecosistema de herramientas ───────────────────────────────────────────────
const TOOLS = {
  docdiet: {
    name: 'docdiet',
    tagline: 'PDFs a dieta para agentes de IA',
    description: 'Cuando Claude Code lee un PDF, docdiet le entrega Markdown compacto en su lugar: menos tokens, mismo contenido. 100 % local.',
    url: 'https://github.com/diegoalvarezf/docdiet',
    install: 'docdiet install',
    hookMarker: 'docdiet',
  },
  'context-pilot': {
    name: 'context-pilot',
    tagline: 'Análisis de impacto de cambios',
    description: '"Has cambiado X — esto es lo que suele cambiar con ello, y por qué." Evita que el agente olvide archivos relacionados. MCP, 100 % local.',
    url: 'https://github.com/diegoalvarezf/context-pilot',
    install: 'context-pilot hook install --claude',
    hookMarker: 'context-pilot',
  },
  autoskills: {
    name: 'autoskills',
    tagline: 'Tu stack de skills, instalado en un comando',
    description: 'Detecta las tecnologías del proyecto e instala las mejores skills para el agente desde skills.sh.',
    url: 'https://autoskills.sh',
    install: 'npx autoskills',
  },
  codestack: {
    name: 'codestack',
    tagline: 'El hub abierto de servidores MCP, skills y agentes',
    description: 'Descubre, instala y publica servidores MCP, skills y stacks completos en un comando.',
    url: 'https://mcp-registry-sigma.vercel.app',
    install: null,
  },
};

// Calibración de docdiet (README): 16 páginas · ~44.582 tokens como PDF → ~19.361 como Markdown
const PDF_TOKENS_PER_PAGE = 44_582 / 16;
const DOCDIET_SAVING      = 1 - 19_361 / 44_582;
const PDF_DEFAULT_PAGES   = 10;   // Read sin `pages`: estimación conservadora
const DOCDIET_MIN_PAGES   = 4;    // docdiet se aparta con 3 páginas o menos

// Sucesor actual de cada modelo antiguo (misma familia)
const SUCCESSOR = {
  'fable-5': 'fable-5-1', 'mythos-5': 'mythos-5-1',
  'opus-5': 'opus-5-5', 'opus-4-8': 'opus-5-5', 'opus-4-7': 'opus-5-5', 'opus-4-6': 'opus-5-5', 'opus-4-5': 'opus-5-5',
  'opus-4-1': 'opus-5-5', 'opus-4': 'opus-5-5', 'opus-3': 'opus-5-5',
  'sonnet-5': 'sonnet-5-5', 'sonnet-4-6': 'sonnet-5-5', 'sonnet-4-5': 'sonnet-5-5', 'sonnet-4': 'sonnet-5-5',
  'sonnet-3-7': 'sonnet-5-5', 'sonnet-3-5': 'sonnet-5-5',
  'haiku-4-5': 'haiku-5-5', 'haiku-3-5': 'haiku-5-5', 'haiku-3': 'haiku-5-5',
};

function readSettingsText() {
  const base = path.join(os.homedir(), '.claude');
  let text = '';
  for (const f of ['settings.json', 'settings.local.json']) {
    try { text += fs.readFileSync(path.join(base, f), 'utf8'); } catch { }
  }
  return text;
}

const tokUsage = t => ({
  input_tokens: t.input, output_tokens: t.output, cache_read_input_tokens: t.cacheRead,
  cache_creation_input_tokens: t.cacheWrite,
  cache_creation: { ephemeral_5m_input_tokens: t.cacheWrite5m, ephemeral_1h_input_tokens: t.cacheWrite1h },
});

/**
 * Devuelve { tips: [...], tools: [...] }.
 * tip = { id, tone: 'save'|'tool'|'info', title, body, metric?, tool?, active? }
 */
function buildInsights(data) {
  const tips  = [];
  const s     = data.signals;
  const hooks = readSettingsText();
  const isActive = t => !!(t.hookMarker && hooks.includes(t.hookMarker));

  // ── docdiet: lecturas de PDF ────────────────────────────────────────────────
  const eligible = s.pdfReads.filter(r => (r.pages || PDF_DEFAULT_PAGES) >= DOCDIET_MIN_PAGES);
  if (s.pdfReads.length) {
    const pages  = eligible.reduce((n, r) => n + (r.pages || PDF_DEFAULT_PAGES), 0);
    const saved  = Math.round(pages * PDF_TOKENS_PER_PAGE * DOCDIET_SAVING);
    const usd    = eligible.reduce((sum, r) => sum + costOfUsage(
      { input_tokens: (r.pages || PDF_DEFAULT_PAGES) * PDF_TOKENS_PER_PAGE * DOCDIET_SAVING }, r.model), 0);
    const files  = new Set(s.pdfReads.map(r => r.file)).size;
    const active = isActive(TOOLS.docdiet);
    tips.push({
      id: 'docdiet', tone: active ? 'info' : 'tool', tool: 'docdiet', active,
      title: active ? 'docdiet está optimizando tus PDFs' : 'Tus PDFs están costando más de la cuenta',
      body: active
        ? `Claude ha leído ${s.pdfReads.length} veces ${files} PDF distintos. Con docdiet activo, los que tienen 4 páginas o más llegan como Markdown.`
        : `Claude ha leído ${s.pdfReads.length} veces ${files} PDF distintos. Como PDF, cada página cuesta texto + imagen; docdiet los convierte a Markdown compacto.`,
      metric: saved > 0 ? { value: saved, unit: 'tokens', label: active ? 'tokens que docdiet puede ahorrar' : 'ahorro posible', usd } : null,
    });
  }

  // ── context-pilot: sesiones con cambios repartidos en muchos archivos ───────
  const wide = Object.values(s.sessions).filter(x => x.editedFiles.size >= 20).sort((a, b) => b.editedFiles.size - a.editedFiles.size);
  if (wide.length) {
    const top    = wide[0];
    const active = isActive(TOOLS['context-pilot']);
    tips.push({
      id: 'context-pilot', tone: active ? 'info' : 'tool', tool: 'context-pilot', active,
      title: active ? 'context-pilot vigila tus cambios grandes' : 'Cambios grandes, riesgo de olvidar archivos',
      body: `${wide.length > 1 ? `${wide.length} sesiones han` : 'Una sesión ha'} editado 20 archivos o más (la mayor: ${top.editedFiles.size} archivos en ${top.project}). `
          + (active ? 'context-pilot avisa de los archivos que suelen cambiar juntos.' : 'context-pilot le dice al agente qué otros archivos suelen cambiar con los que toca, antes de que se le escapen.'),
      metric: { value: top.editedFiles.size, unit: 'archivos', label: 'en una sola sesión' },
    });
  }

  // ── autoskills: proyectos con gasto relevante y sin skills propias ──────────
  const noSkills = Object.entries(data.byProject)
    .filter(([name, p]) => {
      const cwd = s.projectCwd[name];
      if (!cwd || p.cost < data.totals.cost * 0.02) return false;
      try { return !fs.statSync(path.join(cwd, '.claude', 'skills')).isDirectory(); } catch { return fs.existsSync(cwd); }
    })
    .sort((a, b) => b[1].cost - a[1].cost);
  if (noSkills.length) {
    const names = noSkills.slice(0, 3).map(([n]) => n);
    tips.push({
      id: 'autoskills', tone: 'tool', tool: 'autoskills',
      title: `${noSkills.length} proyecto${noSkills.length > 1 ? 's' : ''} sin skills para su stack`,
      body: `${names.join(', ')}${noSkills.length > 3 ? '…' : ''} no tienen <code>.claude/skills</code>. Con skills del stack, el agente acierta antes y repite menos intentos.`,
      metric: { value: noSkills.length, unit: 'proyectos', label: 'sin skills' },
    });
  }

  // ── Modelos antiguos: ahorro por pasar al sucesor (mes actual) ──────────────
  const monthModels = data.byMonthModel[data.thisMonth] || {};
  let current = 0, upgraded = 0; const legacy = [];
  for (const [model, t] of Object.entries(monthModels)) {
    const { key } = resolveModel(model);
    const succ = SUCCESSOR[key];
    if (!succ) continue;
    const alt = costOfUsage(tokUsage(t), `claude-${succ}`);
    if (alt < t.cost) { current += t.cost; upgraded += alt; legacy.push(MODELS[key].name); }
  }
  if (current - upgraded > 1) {
    tips.push({
      id: 'models', tone: 'save',
      title: 'Pasar a los modelos actuales te saldría más barato',
      body: `Este mes has usado ${legacy.join(', ')}. Con el mismo uso en ${[...new Set(legacy.map(n => n.split(' ')[0]))].map(f => `${f} ${f === 'Fable' || f === 'Mythos' ? '5.1' : '5.5'}`).join(' / ')}, `
          + `el coste bajaría de ${fmtUsd(current)} a ${fmtUsd(upgraded)}. En Claude Code: <code>/model</code>.`,
      metric: { value: current - upgraded, unit: 'usd', label: 'menos este mes' },
    });
  }

  // ── Caché: ratio de acierto ─────────────────────────────────────────────────
  const tk = data.totals.tok;
  const prompt = tk.input + tk.cacheRead + tk.cacheWrite;
  if (prompt > 0) {
    const hit = tk.cacheRead / prompt;
    tips.push({
      id: 'cache', tone: hit >= 0.8 ? 'info' : 'save',
      title: hit >= 0.8 ? 'La caché de prompts está funcionando' : 'Poco aprovechamiento de la caché',
      body: hit >= 0.8
        ? `El ${(hit * 100).toFixed(0)} % de lo que Claude lee sale de la caché. Te ha ahorrado ${fmtUsd(data.totals.savings)} frente a pagarlo como entrada normal.`
        : `Solo el ${(hit * 100).toFixed(0)} % sale de la caché. Sesiones largas y continuas (en lugar de muchas cortas) la aprovechan mejor.`,
      metric: { value: data.totals.savings, unit: 'usd', label: 'ahorrado por la caché' },
    });
  }

  // ── codestack: descubrir más servidores MCP ─────────────────────────────────
  const servers = Object.keys(s.mcpServers).length;
  tips.push({
    id: 'codestack', tone: 'tool', tool: 'codestack',
    title: servers ? `Usas ${servers} servidores MCP` : 'Aún no usas servidores MCP',
    body: servers
      ? 'Encuentra más servidores, skills y stacks completos para tus proyectos, o publica los tuyos.'
      : 'Los servidores MCP dan al agente acceso a navegador, bases de datos, diseño... Encuentra los que encajan con tu stack.',
    metric: servers ? { value: servers, unit: 'servidores', label: 'MCP en uso' } : null,
  });

  const order = { save: 0, tool: 1, info: 2 };
  tips.sort((a, b) => order[a.tone] - order[b.tone]);

  const tools = Object.entries(TOOLS).map(([id, t]) => ({ id, ...t, active: isActive(t) }));
  return { tips, tools };
}

const fmtUsd = n => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

module.exports = { buildInsights, TOOLS };
