'use strict';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  require('electron').app.quit();
}

const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('node:path');
const { execFile } = require('child_process');
const validator = require('./validator');
const { isAllowedUrl, cameraPermissionHandler, windowOpenHandler } = validator;
const { EXIT_SHORTCUT, CBT_URL } = require('./constants');

// ---------------------------------------------------------------------------
// Auto-update (public GitHub repo via update-electron-app)
// Only runs in packaged app, not in dev mode.
// ---------------------------------------------------------------------------
if (app.isPackaged) {
  require('update-electron-app')({
    updateInterval: '1 hour',
    logger: require('electron').autoUpdater,
  });
}

// ---------------------------------------------------------------------------
// Window references
// ---------------------------------------------------------------------------

/** @type {BrowserWindow|null} */
let launcherWindow = null;

/** @type {BrowserWindow|null} */
let cbtWindow = null;

// ---------------------------------------------------------------------------
// Win key suppression via Windows API (Windows only)
// ---------------------------------------------------------------------------

/**
 * On Windows, the Win key is processed at kernel level and cannot be blocked
 * by Electron's globalShortcut or before-input-event. We use a PowerShell
 * one-liner that calls the Windows API SystemParametersInfo with
 * SPI_SETSCREENSAVERRUNNING (0x61) which is the documented way to suppress
 * the Win key for kiosk applications.
 */
function suppressWinKey() {
  if (process.platform !== 'win32') return;
  const ps = `Add-Type -TypeDefinition '
using System;
using System.Runtime.InteropServices;
public class WinKey {
  [DllImport("user32.dll")] public static extern bool SystemParametersInfo(uint uiAction, uint uiParam, IntPtr pvParam, uint fWinIni);
  public static void Suppress() { SystemParametersInfo(0x61, 1, IntPtr.Zero, 0); }
}
'; [WinKey]::Suppress()`;
  execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true }, () => {});
}

function restoreWinKey() {
  if (process.platform !== 'win32') return;
  const ps = `Add-Type -TypeDefinition '
using System;
using System.Runtime.InteropServices;
public class WinKey {
  [DllImport("user32.dll")] public static extern bool SystemParametersInfo(uint uiAction, uint uiParam, IntPtr pvParam, uint fWinIni);
  public static void Restore() { SystemParametersInfo(0x61, 0, IntPtr.Zero, 0); }
}
'; [WinKey]::Restore()`;
  execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true }, () => {});
}

// ---------------------------------------------------------------------------
// createLauncherWindow
// ---------------------------------------------------------------------------

function createLauncherWindow() {
  launcherWindow = new BrowserWindow({
    width: 420,
    height: 560,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  launcherWindow.loadFile(path.join(__dirname, 'index.html'));

  launcherWindow.on('closed', () => {
    launcherWindow = null;
  });
}

// ---------------------------------------------------------------------------
// buildErrorPage
// ---------------------------------------------------------------------------

function buildErrorPage(message) {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Gagal Memuat Halaman</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; background: #0e0e11;
      font-family: 'Segoe UI', Arial, sans-serif; color: #e8e8ed;
    }
    .card {
      text-align: center; padding: 40px 36px;
      background: #18181c; border: 1px solid #2a2a30;
      border-radius: 20px; max-width: 400px; width: 90%;
    }
    .icon { font-size: 48px; margin-bottom: 20px; }
    h1 { font-size: 18px; font-weight: 600; margin-bottom: 10px; color: #ef4444; }
    p { font-size: 13px; line-height: 1.6; color: #6b6b78; margin-bottom: 28px; }
    button {
      background: #6366f1; color: #fff; border: none;
      border-radius: 10px; padding: 10px 28px;
      font-size: 14px; font-weight: 600; cursor: pointer;
    }
    button:hover { opacity: 0.85; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">⚠️</div>
    <h1>Halaman Tidak Dapat Dimuat</h1>
    <p>${message}</p>
    <button onclick="window.electronAPI.retryLoad()">Coba Lagi</button>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// createCbtWindow
// ---------------------------------------------------------------------------

function createCbtWindow(selectedCameraDeviceId) {
  cbtWindow = new BrowserWindow({
    fullscreen: true,
    kiosk: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const { webContents } = cbtWindow;

  // Pre-grant camera permission — auto-allow 'media' requests
  webContents.session.setPermissionRequestHandler((_wc, permission, callback, details) => {
    cameraPermissionHandler(permission, callback, details);
  });

  // Navigation guard — block URLs outside CBT domain
  webContents.on('will-navigate', (event, url) => {
    if (!isAllowedUrl(url)) event.preventDefault();
  });

  // Block new window requests
  webContents.setWindowOpenHandler(windowOpenHandler);

  // Disable context menu
  webContents.on('context-menu', (e) => e.preventDefault());

  // Block dangerous keyboard shortcuts
  webContents.on('before-input-event', (event, input) => {
    const { key, control, shift, alt } = input;
    const blocked =
      key === 'F11' || key === 'F12' ||
      (control && key === 'r') || (control && key === 'w') ||
      (alt && key === 'F4') || (control && shift && key === 'i');
    if (blocked) event.preventDefault();
  });

  // Error handler — inject error page on load failure
  webContents.on('did-fail-load', (_event, errorCode) => {
    const isTimeout = errorCode === -7; // ERR_TIMED_OUT
    const message = isTimeout
      ? 'Server ujian tidak merespons. Hubungi pengawas ujian.'
      : 'Gagal memuat halaman ujian. Periksa koneksi internet Anda.';
    webContents.executeJavaScript(`
      document.open();
      document.write(${JSON.stringify(buildErrorPage(message))});
      document.close();
    `);
  });

  // Restore OS state when window is closed
  cbtWindow.on('closed', () => {
    unregisterKioskShortcuts();
    restoreWinKey();
    cbtWindow = null;
  });

  // Load CBT_URL — after all guards are set up
  cbtWindow.loadURL(CBT_URL);

  // Suppress Win key and register kiosk shortcuts
  suppressWinKey();
  registerKioskShortcuts();
}

// ---------------------------------------------------------------------------
// Shortcut management
// ---------------------------------------------------------------------------

function registerExitShortcut() {
  globalShortcut.register(EXIT_SHORTCUT, () => app.quit());
}

function registerKioskShortcuts() {
  const noop = () => {};
  [
    'Super+D', 'Super+E', 'Super+L', 'Super+R', 'Super+Tab',
    'Super+A', 'Super+S', 'Super+I', 'Super+X',
    'Alt+Escape', 'Ctrl+Escape',
  ].forEach((key) => globalShortcut.register(key, noop));
}

function unregisterKioskShortcuts() {
  [
    'Super+D', 'Super+E', 'Super+L', 'Super+R', 'Super+Tab',
    'Super+A', 'Super+S', 'Super+I', 'Super+X',
    'Alt+Escape', 'Ctrl+Escape',
  ].forEach((key) => globalShortcut.unregister(key));
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

function registerIpcHandlers() {
  // Run device validation
  ipcMain.handle('run-validation', async () => {
    try {
      return await validator.runAll();
    } catch (err) {
      return { error: true, message: err.message || 'Validasi gagal' };
    }
  });

  // Enumerate camera devices — returns array of { deviceId, label }
  // Uses desktopCapturer as a proxy; actual video input enumeration
  // happens in the renderer via navigator.mediaDevices (see preload).
  // This handler returns the list from the renderer-side enumeration
  // that was passed up via IPC.
  ipcMain.handle('get-cameras', async () => {
    try {
      // We ask the renderer to enumerate via navigator.mediaDevices.
      // The renderer calls this after getUserMedia to get labelled devices.
      // Here we just return an empty array as a fallback — the renderer
      // does the real enumeration and sends results back via 'camera-list'.
      return [];
    } catch {
      return [];
    }
  });

  // Start exam with the selected camera deviceId
  ipcMain.handle('start-exam', (_event, selectedCameraDeviceId) => {
    try {
      if (launcherWindow && !launcherWindow.isDestroyed()) {
        launcherWindow.close();
      }
      createCbtWindow(selectedCameraDeviceId);
    } catch (err) {
      return { error: true, message: err.message || 'Gagal memulai ujian' };
    }
  });

  // Retry loading CBT_URL
  ipcMain.handle('retry-load', () => {
    try {
      if (cbtWindow && !cbtWindow.isDestroyed()) {
        cbtWindow.loadURL(CBT_URL);
      }
    } catch (err) {
      return { error: true, message: err.message || 'Gagal memuat ulang' };
    }
  });

  // Auto-update status events forwarded to renderer
  if (app.isPackaged) {
    const { autoUpdater } = require('electron');
    autoUpdater.on('update-available', () => {
      if (launcherWindow && !launcherWindow.isDestroyed()) {
        launcherWindow.webContents.send('update-status', { status: 'available' });
      }
    });
    autoUpdater.on('update-downloaded', () => {
      if (launcherWindow && !launcherWindow.isDestroyed()) {
        launcherWindow.webContents.send('update-status', { status: 'downloaded' });
      }
    });
    autoUpdater.on('update-not-available', () => {
      if (launcherWindow && !launcherWindow.isDestroyed()) {
        launcherWindow.webContents.send('update-status', { status: 'up-to-date' });
      }
    });
    autoUpdater.on('error', (err) => {
      if (launcherWindow && !launcherWindow.isDestroyed()) {
        launcherWindow.webContents.send('update-status', { status: 'error', message: err.message });
      }
    });
  }

  // Install update and restart
  ipcMain.handle('install-update', () => {
    if (app.isPackaged) {
      require('electron').autoUpdater.quitAndInstall();
    }
  });
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  registerIpcHandlers();
  registerExitShortcut();
  createLauncherWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createLauncherWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  restoreWinKey();
  globalShortcut.unregisterAll();
});
