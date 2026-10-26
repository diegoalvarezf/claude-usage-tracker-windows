# Claude Usage Tracker for Windows

Monitor de uso de tokens y costes de **Claude Code** en Windows.
Inspirado en [masorange/ClaudeUsageTracker](https://github.com/masorange/ClaudeUsageTracker) (macOS), portado y mejorado para Windows.

---

## Instalación

**Recomendado — pnpm** (más seguro: bloquea scripts de instalación por defecto y pide confirmación explícita):

```
pnpm add -g @diegoalvarezf/claude-usage-tracker
pnpm approve-builds   # aprueba el script de setup de la bandeja del sistema
```

**Alternativa — npm:**

```
npm install -g @diegoalvarezf/claude-usage-tracker
```

Si alguno de los comandos anteriores falla, instalar directamente desde el repositorio:

```
pnpm add -g https://github.com/diegoalvarezf/claude-usage-tracker-windows
```

Eso es todo. El instalador:
- Lanza el icono `$` en la **bandeja del sistema** automáticamente
- Lo registra para que **arranque con Windows**
- Deja los comandos `claude-usage` y `claude-usage-tray` disponibles en el PATH

**Requisito único:** [Node.js](https://nodejs.org) v16+ (LTS recomendada)

> **Nota sobre el script `postinstall`:** este paquete ejecuta un script automático al instalarse (`postinstall.js`) que lanza la bandeja del sistema y registra el arranque con Windows. Es el comportamiento esperado e intencionado. Por eso se recomienda pnpm, que muestra exactamente qué scripts se van a ejecutar y pide aprobación antes de hacerlo.

---

## Características

| | |
|---|---|
| Icono naranja en la bandeja del sistema con gasto del mes | ✅ |
| Popup con stats en tiempo real (hoy / mes / total) | ✅ |
| Reporte HTML rediseñado: mes actual con **previsión** y comparativa, gasto diario, coste mensual por modelo | ✅ |
| **Consejos personalizados** a partir de tu uso real (ahorro por modelo, caché, PDFs, cambios grandes...) | ✅ |
| Recomienda las herramientas del ecosistema (**docdiet, context-pilot, autoskills, codestack**) y detecta si ya las tienes activas | ✅ |
| **Claude Code + Codex CLI (OpenAI) + Gemini CLI (Google)** en el mismo reporte | ✅ |
| Precios oficiales al día: caché de 5 min / 1 h, fast mode, contexto largo, *fallback* entre modelos, web search | ✅ |
| Respuestas duplicadas y subagentes contados correctamente | ✅ |
| Tablas ordenables, búsqueda de proyectos, export CSV, modo claro/oscuro | ✅ |
| Modo **API** (coste real) y **Plan** (equiv. estimado Max/Pro) | ✅ |
| Extensión VS Code con coste en la barra de estado | ✅ |
| Sin dependencias externas (solo Node.js), 100 % local | ✅ |

---

## Uso

### Bandeja del sistema

Después de instalar aparece un icono naranja **`$`** en la bandeja (esquina inferior derecha).

| Acción | Resultado |
|---|---|
| **Clic izquierdo** | Abre el reporte HTML en el navegador |
| **Clic derecho** | Popup con stats y opciones |

**Popup:**
```
┌─────────────────────────────────┐
│ Claude Cost                 API │
├─────────────────────────────────┤
│ Este mes              $1.2345   │
│ Hoy                   $0.0123   │
│ Total                 $8.9012   │
├─────────────────────────────────┤
│ [Ver reporte]                   │
├─────────────────────────────────┤
│ [Modo: API]  [Arranque]  [Salir]│
└─────────────────────────────────┘
```

### Comandos

```bash
claude-usage              # reporte HTML — modo API
claude-usage --plan       # reporte HTML — modo Plan (suscripción plana)
claude-usage-tray         # relanzar la bandeja si se cierra
```

### Reporte HTML

- **Este mes**: gasto, previsión a fin de mes y comparativa con el mismo tramo del mes anterior
- **Consejos para ti**: calculados con tu uso real (ver abajo)
- **Gasto diario** (30 días / 90 días / 1 año) y **coste mensual por modelo**, con detalle al pasar el ratón
- Pestañas **Proyectos · Modelos · Meses**, con búsqueda y ordenación
- **Herramientas de la casa**: docdiet, context-pilot, autoskills y codestack
- Botón **CSV** para descargar todos los datos

### Consejos

| Consejo | Cuándo aparece |
|---|---|
| Pasar a los modelos actuales | Este mes has usado modelos antiguos y su sucesor te saldría más barato con el mismo uso |
| docdiet | Claude ha leído PDFs (estima los tokens que ahorra convertirlos a Markdown) |
| context-pilot | Sesiones que editan 20 archivos o más |
| autoskills | Proyectos con gasto relevante sin `.claude/skills` |
| codestack | Siempre, para descubrir servidores MCP, skills y stacks |
| Caché | Porcentaje de la entrada que sale de la caché y lo que te ha ahorrado |

Si docdiet o context-pilot ya están instalados como hooks en `~/.claude/settings.json`, el consejo lo indica en lugar de recomendar instalarlos.

---

## Modo API vs Modo Plan

| | Modo `api` | Modo `plan` |
|---|---|---|
| **Para quién** | Facturación directa por tokens | Suscripción Claude Max / Pro |
| **Costes mostrados** | Coste real en USD | Equivalente estimado de API |
| **Bandeja** | `$1.23 / $9.45` | `~$1.23 / ~$9.45` |

Cambiar modo desde el popup: clic derecho → botón **Modo: API / Plan**.

---

## Actualizar

```
pnpm update -g @diegoalvarezf/claude-usage-tracker
```

O con npm:

```
npm update -g @diegoalvarezf/claude-usage-tracker
```

---

## Extensión VS Code (opcional)

La extensión muestra el coste en la barra de estado inferior derecha de VS Code.
Instalar desde el `.vsix` incluido en la carpeta `vscode-extension/`:

```
code --install-extension vscode-extension\claude-usage-tracker-2.0.0.vsix
```

**Configuración** (busca "Claude Usage" en la Configuración de VS Code):

| Ajuste | Valores | Por defecto |
|---|---|---|
| `claudeUsage.billingMode` | `api` / `plan` | `api` |
| `claudeUsage.refreshIntervalSeconds` | Número (mín. 10) | `60` |

---

## Instalación manual (sin npm)

Si prefieres instalar sin npm, desde la carpeta del proyecto:

```powershell
# Clic derecho → "Ejecutar con PowerShell", o:
powershell -ExecutionPolicy Bypass -File install.ps1
```

Útil para despliegue desde una **carpeta compartida de empresa** (SharePoint / OneDrive):
coloca la carpeta en el recurso compartido y cada compañero ejecuta `install.ps1` una sola vez.
Las actualizaciones llegan automáticamente al reiniciar Windows.

---

## Estructura del repositorio

```
claude-usage-tracker-windows/
├── claude-usage.js          Generador del reporte HTML (bin: claude-usage)
├── lib/
│   ├── pricing.js           Precios oficiales de Anthropic y cálculo de coste
│   ├── pricing-others.js    Precios de OpenAI y Gemini
│   ├── usage.js             Lectura, deduplicación y agregación de los logs
│   ├── providers/           Lectores de Codex CLI y Gemini CLI
│   ├── insights.js          Consejos y ecosistema de herramientas
│   └── report.js            Reporte HTML
├── test/                    Tests (npm test)
├── tray.ps1                 App de bandeja del sistema (PowerShell puro)
├── tray-launcher.js         Relanzador de la bandeja (bin: claude-usage-tray)
├── postinstall.js           Setup automático tras npm install -g
├── orange-logo.svg          Logo Orange (favicon y topbar del reporte)
├── install.ps1              Instalador manual (alternativa al npm)
├── package.json             Manifiesto npm
├── README.md
└── vscode-extension/
    ├── extension.js
    ├── package.json
    └── claude-usage-tracker-2.0.0.vsix
```

---

## Precios de los modelos

Precios oficiales de la API de Anthropic (USD por millón de tokens) — _última revisión: 24 de octubre de 2026_.
Fuente: [platform.claude.com/docs/en/about-claude/pricing](https://platform.claude.com/docs/en/about-claude/pricing). Están en [`lib/pricing.js`](lib/pricing.js).

| Modelo | Entrada | Cache escr. 5 min | Cache escr. 1 h | Cache lect. | Salida |
|---|---|---|---|---|---|
| Fable 5.1 / Mythos 5.1 | $10.00 | $12.50 | $20.00 | $0.25 | $50.00 |
| Fable 5 / Mythos 5 | $10.00 | $12.50 | $20.00 | $1.00 | $50.00 |
| Opus 5.5 | $4.00 | $5.00 | $8.00 | $0.20 | $20.00 |
| Opus 5 / 4.8 / 4.7 / 4.6 / 4.5 | $5.00 | $6.25 | $10.00 | $0.50 | $25.00 |
| Opus 4.1 / 4 / 3 _(retirados)_ | $15.00 | $18.75 | $30.00 | $1.50 | $75.00 |
| Sonnet 5.5 | $2.00 | $2.50 | $4.00 | $0.10 | $10.00 |
| Sonnet 5 | $2.00 | $2.50 | $4.00 | $0.20 | $10.00 |
| Sonnet 4.6 / 4.5 / 4 / 3.7 / 3.5 | $3.00 | $3.75 | $6.00 | $0.30 | $15.00 |
| Haiku 5.5 (prompt ≤ 100K) | $0.10 | $0.125 | $0.20 | $0.01 | $0.50 |
| Haiku 5.5 (prompt > 100K) | $0.50 | $0.625 | $1.00 | $0.05 | $2.50 |
| Haiku 4.5 | $1.00 | $1.25 | $2.00 | $0.10 | $5.00 |
| Haiku 3.5 _(retirado)_ | $0.80 | $1.00 | $1.60 | $0.08 | $4.00 |
| Haiku 3 _(retirado)_ | $0.25 | $0.30 | $0.50 | $0.03 | $1.25 |

Además se tienen en cuenta:
- **Fast mode** (`speed: "fast"`): Opus 5.5 a $8 / $40; Opus 5 y 4.8 a $10 / $50.
- **Inferencia solo en EE. UU.** (`inference_geo: "us"`): ×1.1 en modelos 4.6 o posteriores.
- **Web search**: $10 por cada 1.000 búsquedas (web fetch no tiene coste extra).
- **Fallback** de un modelo a otro: cada intento se factura con el precio de su propio modelo.

Los precios de Opus 3, Sonnet 3.7 y Haiku 3 ya no aparecen en la página oficial (modelos retirados); se usa el último precio publicado.

Los precios de **OpenAI** (GPT-6, GPT-5.x, o-series...) y **Gemini** (4 Argon, 3.x, 2.5...) están en [`lib/pricing-others.js`](lib/pricing-others.js), con sus tramos de contexto largo (más de 272K / 200K tokens) y las subidas de precio ya anunciadas por Google (Gemini 4 Argon desde el 1-12-2026; 3.8/3.6 Flash desde el 1-1-2027).

---

## Cómo funciona

Todo se lee de los logs locales; no se envía ningún dato a servidores externos.

| Herramienta | Logs | Notas |
|---|---|---|
| **Claude Code** | `%USERPROFILE%\.claude\projects\` (o `CLAUDE_CONFIG_DIR`), subagentes incluidos | Cada respuesta aparece varias veces en el log: se deduplica por `message.id` + `requestId`. Con *fallback*, cada intento se factura con su modelo. |
| **Codex CLI** | `%USERPROFILE%\.codex\sessions\` y `archived_sessions\` (o `CODEX_HOME`) | Usa `token_usage_record` si existe; si no, deltas del contador acumulado `token_count`, ignorando repeticiones, reinicios y eventos copiados por los *forks*. |
| **Gemini CLI** | `%USERPROFILE%\.gemini\tmp\<proyecto>\chats\` (o `GEMINI_CLI_HOME`) | Cada mensaje se reescribe varias veces: se deduplica por `id`. Los *thoughts* se cobran como salida. Gemini CLI borra el historial de más de 30 días por defecto, y sus llamadas auxiliares (router, resúmenes) no quedan registradas. |

Bandeja, reporte y extensión comparten el mismo cálculo (`lib/`), así que siempre muestran la misma cifra.

---

## Créditos

- Original (macOS, Swift): [masorange/ClaudeUsageTracker](https://github.com/masorange/ClaudeUsageTracker)
- Adaptación Windows: [diegoalvarezf/claude-usage-tracker-windows](https://github.com/diegoalvarezf/claude-usage-tracker-windows)
