# Tech Stack

## Runtime & Framework
- **Electron** 41.2.1 — desktop app shell
- **electron-forge** 7.x — build, package, and publish toolchain
- **electron-squirrel-startup** — Windows installer shortcut handling

## Security (Fuses)
Electron Fuses are configured at package time in `forge.config.js`:
- `RunAsNode`: disabled
- `EnableCookieEncryption`: enabled
- `EnableNodeOptionsEnvironmentVariable`: disabled
- `EnableNodeCliInspectArguments`: disabled
- `EnableEmbeddedAsarIntegrityValidation`: enabled
- `OnlyLoadAppFromAsar`: enabled

## Packaging
- Output is bundled into an ASAR archive (`packagerConfig.asar: true`)
- Makers: Squirrel (Windows), ZIP (macOS), DEB + RPM (Linux)

## Common Commands

| Task | Command |
|------|---------|
| Start dev app | `npm start` |
| Package app | `npm run package` |
| Build installers | `npm run make` |
| Publish | `npm run publish` |
| Lint | `npm run lint` *(no-op, not configured)* |

## Language
- Plain JavaScript (CommonJS `require`/`module.exports`) — no TypeScript, no bundler/transpiler configured yet.
