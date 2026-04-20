# Project Structure

```
yamicbtdesktop/
├── src/
│   ├── index.js       # Main process entry point — creates BrowserWindow, app lifecycle
│   ├── preload.js     # Preload script — bridge between main and renderer processes
│   ├── index.html     # Renderer entry point (UI)
│   └── index.css      # Global styles for the renderer
├── forge.config.js    # Electron Forge config (makers, plugins, fuses)
├── package.json
└── .kiro/
    └── steering/      # AI assistant steering documents
```

## Electron Process Model
- **Main process** (`src/index.js`): Node.js environment, manages windows and app lifecycle.
- **Renderer process** (`src/index.html` + `src/index.css`): Browser environment, renders the UI.
- **Preload script** (`src/preload.js`): Runs in renderer context with Node access; use it to expose safe APIs to the renderer via `contextBridge`.

## Conventions
- New main-process modules go in `src/` and are imported into `index.js`.
- Renderer-side code (HTML/CSS/JS) lives in `src/`.
- IPC communication should go through `preload.js` using `contextBridge` — avoid `nodeIntegration: true`.
- Keep `forge.config.js` as the single source of truth for build/packaging config.
