const vscode = require('vscode');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');

// ─── Datos ───────────────────────────────────────────────────────────────────
// lib/ es una copia de ../lib (npm run sync-extension) para que el .vsix sea autocontenido
const { loadUsage }     = require('./lib/usage');
const { buildInsights } = require('./lib/insights');
const { renderReport }  = require('./lib/report');

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const monthLabel = m => { const [y, mo] = m.split('-'); return `${MONTHS[parseInt(mo, 10) - 1]} ${y}`; };
const fmt   = n => n >= 1e9 ? `${(n/1e9).toFixed(2)}B` : n >= 1e6 ? `${(n/1e6).toFixed(1)}M` : n >= 1e3 ? `${(n/1e3).toFixed(1)}K` : String(n);
const money = (n, isPlan) => `${isPlan ? '~' : ''}$${n.toFixed(2)}`;
const PROVIDER = { anthropic: 'Claude', openai: 'OpenAI', google: 'Gemini' };

// ─── Extensión VS Code ────────────────────────────────────────────────────────
let statusBarItem;
let refreshTimer;

function getConfig() {
  const cfg = vscode.workspace.getConfiguration('claudeUsage');
  return {
    isPlan:          cfg.get('billingMode', 'api') === 'plan',
    refreshInterval: Math.max(10, cfg.get('refreshIntervalSeconds', 60)) * 1000,
  };
}

function updateStatusBar() {
  const { isPlan } = getConfig();
  try {
    const d = loadUsage();
    if (!d.sources.length) {
      statusBarItem.text    = '$(warning) Claude: sin datos';
      statusBarItem.tooltip = 'No se encontraron logs de Claude Code, Codex CLI ni Gemini CLI';
      return;
    }
    const t = d.totals.tok;
    const providers = Object.entries(d.byProvider).sort((a, b) => b[1].cost - a[1].cost);
    statusBarItem.text = `$(credit-card) ${money(d.monthCost, isPlan)} / ${money(d.totals.cost, isPlan)}`;
    statusBarItem.tooltip = [
      'Uso y costes de IA',
      `Modo: ${isPlan ? 'Plan (tarifa plana)' : 'API (por tokens)'}`,
      '',
      `Hoy: ${money(d.todayTot.cost, isPlan)}`,
      `Mes actual (${monthLabel(d.thisMonth)}): ${money(d.monthCost, isPlan)}`,
      `Total acumulado: ${money(d.totals.cost, isPlan)}`,
      ...(providers.length > 1 ? ['', ...providers.map(([id, p]) => `${PROVIDER[id] || id}: ${money(p.cost, isPlan)}`)] : []),
      '',
      `Entrada: ${fmt(t.input)} · Caché: ${fmt(t.cacheRead + t.cacheWrite)} · Salida: ${fmt(t.output)}`,
      isPlan ? '⚠ Importes equivalentes estimados (no cargos reales)' : '',
      'Clic para abrir el reporte completo',
    ].filter(l => l !== '').join('\n');
  } catch (err) {
    statusBarItem.text    = '$(warning) Claude: error';
    statusBarItem.tooltip = String(err);
  }
}

function openReport() {
  const { isPlan } = getConfig();
  try {
    const d = loadUsage();
    let logoInline = '', logoB64 = '';
    try {
      logoInline = fs.readFileSync(path.join(__dirname, 'orange-logo.svg'), 'utf8').trim();
      logoB64    = Buffer.from(logoInline).toString('base64');
    } catch { }
    const outFile = path.join(os.tmpdir(), 'claude-usage-report.html');
    fs.writeFileSync(outFile, renderReport(d, buildInsights(d), { plan: isPlan, logoInline, logoB64 }), 'utf8');
    vscode.env.openExternal(vscode.Uri.file(outFile));
  } catch (err) {
    vscode.window.showErrorMessage(`No se pudo generar el reporte: ${err.message || err}`);
  }
}

function scheduleRefresh(ctx) {
  const { refreshInterval } = getConfig();
  clearInterval(refreshTimer);
  refreshTimer = setInterval(updateStatusBar, refreshInterval);
  ctx.subscriptions.push({ dispose: () => clearInterval(refreshTimer) });
}

function activate(context) {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'claudeUsage.openReport';
  statusBarItem.show();

  context.subscriptions.push(
    statusBarItem,
    vscode.commands.registerCommand('claudeUsage.openReport', openReport),
    vscode.commands.registerCommand('claudeUsage.refresh',    updateStatusBar),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('claudeUsage')) {
        updateStatusBar();
        scheduleRefresh(context);
      }
    }),
  );

  updateStatusBar();
  scheduleRefresh(context);
}

function deactivate() {
  clearInterval(refreshTimer);
}

module.exports = { activate, deactivate };
