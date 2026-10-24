#!/usr/bin/env node
/**
 * claude-usage.js — Reporte HTML de uso y costes de Claude Code (Windows)
 *
 * Uso:
 *   node claude-usage.js           → modo API  (coste real)
 *   node claude-usage.js --plan    → modo Plan (equivalente estimado, suscripción plana)
 *   node claude-usage.js --json    → resumen en JSON (lo usa la bandeja del sistema)
 *   node claude-usage.js --no-open → genera el reporte sin abrir el navegador
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execSync } = require('child_process');

const { loadUsage }       = require('./lib/usage');
const { buildInsights }   = require('./lib/insights');
const { renderReport }    = require('./lib/report');
const { PRICING_UPDATED } = require('./lib/pricing');

const IS_PLAN = process.argv.includes('--plan');

// ─── Datos ───────────────────────────────────────────────────────────────────
const data = loadUsage();
if (!data.projectDirs.length) {
  console.error(`No se encontró la carpeta de proyectos de Claude Code (${path.join(os.homedir(), '.claude', 'projects')})`);
  process.exit(1);
}

// Resumen para la bandeja del sistema
if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify({
    total: data.totals.cost, today: data.todayTot.cost, month: data.monthCost, monthKey: data.thisMonth,
    requests: data.totals.requests, unknownModels: data.unknownModels, pricingUpdated: PRICING_UPDATED,
  }));
  process.exit(0);
}

// ─── Logo Orange ──────────────────────────────────────────────────────────────
const LOGO_PATHS = [
  path.join(__dirname, 'orange-logo.svg'),
  path.join(os.homedir(), 'OneDrive - MASORANGE', 'Descargas', 'Orange_Master_logo.svg'),
];
let logoB64 = '', logoInline = '';
for (const p of LOGO_PATHS) {
  try {
    const svgRaw = fs.readFileSync(p, 'utf8');
    logoB64    = Buffer.from(svgRaw).toString('base64');
    logoInline = svgRaw.trim();
    break;
  } catch { }
}

// ─── Reporte ─────────────────────────────────────────────────────────────────
const html    = renderReport(data, buildInsights(data), { plan: IS_PLAN, logoB64, logoInline });
const outFile = path.join(os.tmpdir(), 'claude-usage-report.html');
fs.writeFileSync(outFile, html, 'utf8');
console.log(`\n  Reporte: ${outFile}`);
console.log(`  Modo:    ${IS_PLAN ? 'Plan (equiv. estimado)' : 'API (coste real)'}\n`);

if (!process.argv.includes('--no-open')) {
  try {
    const cmd = process.platform === 'win32' ? `rundll32 url.dll,FileProtocolHandler "${outFile}"`
              : process.platform === 'darwin' ? `open "${outFile}"` : `xdg-open "${outFile}"`;
    execSync(cmd, { stdio: 'ignore', shell: true });
  } catch {
    console.log(`  Abre manualmente: ${outFile}`);
  }
}
