#!/usr/bin/env node
/**
 * tray-launcher.js — Comando `claude-usage-tray`
 * Lanza (o relanza) la bandeja del sistema.
 */

const path  = require('path');
const { spawn } = require('child_process');

if (process.platform !== 'win32') {
  console.error('Claude Usage Tracker solo está disponible en Windows.');
  process.exit(1);
}

const trayScript = path.join(__dirname, 'tray.ps1');

const proc = spawn('powershell.exe', [
  '-WindowStyle', 'Hidden',
  '-ExecutionPolicy', 'Bypass',
  '-File', trayScript
], { detached: true, stdio: 'ignore' });

proc.unref();
console.log('Bandeja del sistema iniciada. Busca el icono $ en la esquina inferior derecha.');
