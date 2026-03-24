/**
 * postinstall.js — Se ejecuta automáticamente al hacer npm install -g
 * Lanza la bandeja del sistema y registra el inicio automático con Windows.
 */

const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { spawn } = require('child_process');

// Solo Windows
if (process.platform !== 'win32') {
  console.log('Claude Usage Tracker solo está disponible en Windows.');
  process.exit(0);
}

const trayScript = path.join(__dirname, 'tray.ps1');
const startupVbs = path.join(
  os.homedir(),
  'AppData', 'Roaming',
  'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup',
  'ClaudeUsageTracker.vbs'
);

// 1. Registrar inicio automático con Windows
try {
  const vbs = `Dim sh : Set sh = CreateObject("WScript.Shell")\r\nsh.Run "powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File """ & "${trayScript.replace(/\\/g, '\\\\')}" & """", 0, False`;
  fs.writeFileSync(startupVbs, vbs, 'ascii');
} catch (e) {
  // No es crítico si falla (ej. permisos)
}

// 2. Lanzar la bandeja ahora mismo
try {
  spawn('powershell.exe', [
    '-WindowStyle', 'Hidden',
    '-ExecutionPolicy', 'Bypass',
    '-File', trayScript
  ], { detached: true, stdio: 'ignore' }).unref();
} catch (e) {
  // silencioso
}

// 3. Mensaje de éxito
console.log(`
╔══════════════════════════════════════════════════════╗
║   Claude Usage Tracker instalado correctamente       ║
╚══════════════════════════════════════════════════════╝

  El icono naranja $ aparecerá en la bandeja del sistema
  en unos segundos. Se iniciará automáticamente con Windows.

  Comandos disponibles:

    claude-usage              → reporte HTML (modo API)
    claude-usage --plan       → reporte HTML (modo Plan / Max)
    claude-usage-tray         → relanzar la bandeja del sistema

  Clic izquierdo en el icono → reporte completo
  Clic derecho               → menú con stats y opciones
`);
