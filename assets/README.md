# App Icons

Place your icon files here before building:

| File | Platform | Requirement |
|------|----------|-------------|
| `icon.ico` | Windows | Multi-size ICO, minimal 256×256 px |
| `icon.icns` | macOS | ICNS format |
| `icon.png` | Linux | PNG, 512×512 px |

## How to create icon files

### From a single PNG (512×512 or larger)

**Windows `.ico`** — use an online converter like https://convertio.co/png-ico/
or install ImageMagick:
```
magick convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico
```

**macOS `.icns`** — on macOS:
```
mkdir icon.iconset
sips -z 512 512 icon.png --out icon.iconset/icon_512x512.png
iconutil -c icns icon.iconset
```

**Linux `.png`** — just use the 512×512 PNG directly.

## Notes
- If icon files are missing, electron-forge will fall back to the default Electron icon.
- The `icon` field in `forge.config.js` points to `assets/icon` (no extension) —
  electron-forge automatically picks `.ico` on Windows, `.icns` on macOS, `.png` on Linux.
