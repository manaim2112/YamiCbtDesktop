'use strict';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  require('electron').app.quit();
}

const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('node:path');
const { spawn } = require('child_process');
const validator = require('./validator');
const { isAllowedUrl, cameraPermissionHandler, windowOpenHandler } = validator;
const { EXIT_SHORTCUT, CBT_URL } = require('./constants');

// ---------------------------------------------------------------------------
// Auto-update (public GitHub repo via update-electron-app)
// Only runs in packaged app, not in dev mode.
// ---------------------------------------------------------------------------
if (app.isPackaged) {
  const { updateElectronApp } = require('update-electron-app');
  updateElectronApp({ updateInterval: '1 hour' });
}

// ---------------------------------------------------------------------------
// Camera result from renderer (set before runValidation is called)
// ---------------------------------------------------------------------------
/** @type {Array<{deviceId: string, label: string}>} */
let rendererCameraList = null;



/** @type {BrowserWindow|null} */
let launcherWindow = null;

/** @type {BrowserWindow|null} */
let cbtWindow = null;

// ---------------------------------------------------------------------------
// Win key suppression via Windows API (Windows only)
// ---------------------------------------------------------------------------

/**
 * On Windows 10/11, the Win key is handled at kernel level and cannot be
 * blocked by SPI_SETSCREENSAVERRUNNING (unreliable on modern Windows) or
 * Electron's globalShortcut / before-input-event.
 *
 * The only reliable method is a WH_KEYBOARD_LL low-level keyboard hook that
 * intercepts VK_LWIN (0x5B) and VK_RWIN (0x5C) before they reach the shell.
 * We run this hook in a background PowerShell process that stays alive while
 * the CBT window is open, then kill it on close.
 */

/** @type {import('child_process').ChildProcess|null} */
let winKeyHookProcess = null;

// C# source for the low-level keyboard hook. Runs a message loop in a
// dedicated STA thread so the hook stays active.
const WIN_KEY_HOOK_CS = `
using System;
using System.Runtime.InteropServices;
using System.Threading;
using System.Diagnostics;

class WinKeyBlocker {
  const int WH_KEYBOARD_LL = 13;
  const int WM_KEYDOWN     = 0x0100;
  const int WM_KEYUP       = 0x0101;
  const int WM_SYSKEYDOWN  = 0x0104;
  const int WM_SYSKEYUP    = 0x0105;
  const int VK_LWIN        = 0x5B;
  const int VK_RWIN        = 0x5C;

  delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);

  [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);
  [DllImport("user32.dll")] static extern bool   UnhookWindowsHookEx(IntPtr hhk);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);
  [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string lpModuleName);
  [DllImport("user32.dll")] static extern int GetMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);
  [DllImport("user32.dll")] static extern bool TranslateMessage(ref MSG lpMsg);
  [DllImport("user32.dll")] static extern IntPtr DispatchMessage(ref MSG lpMsg);

  [StructLayout(LayoutKind.Sequential)]
  struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam; public IntPtr lParam; public uint time; public int ptX; public int ptY; }

  [StructLayout(LayoutKind.Sequential)]
  struct KBDLLHOOKSTRUCT { public uint vkCode; public uint scanCode; public uint flags; public uint time; public IntPtr dwExtraInfo; }

  static IntPtr hookId = IntPtr.Zero;
  static LowLevelKeyboardProc hookProc;

  static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam) {
    if (nCode >= 0) {
      var kb = (KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(KBDLLHOOKSTRUCT));
      if (kb.vkCode == VK_LWIN || kb.vkCode == VK_RWIN) {
        return (IntPtr)1; // swallow the key
      }
    }
    return CallNextHookEx(hookId, nCode, wParam, lParam);
  }

  static void RunHook() {
    hookProc = HookCallback;
    using (var curProcess = Process.GetCurrentProcess())
    using (var curModule  = curProcess.MainModule) {
      hookId = SetWindowsHookEx(WH_KEYBOARD_LL, hookProc, GetModuleHandle(curModule.ModuleName), 0);
    }
    MSG msg;
    while (GetMessage(out msg, IntPtr.Zero, 0, 0) != 0) {
      TranslateMessage(ref msg);
      DispatchMessage(ref msg);
    }
    UnhookWindowsHookEx(hookId);
  }

  static void Main() {
    var t = new Thread(RunHook);
    t.SetApartmentState(ApartmentState.STA);
    t.IsBackground = false;
    t.Start();
    t.Join();
  }
}
`;

function suppressWinKey() {
  if (process.platform !== 'win32') return;
  if (winKeyHookProcess) return; // already running

  // Write C# source to a temp file and compile+run it via PowerShell
  const ps = `
$src = @'
${WIN_KEY_HOOK_CS}
'@
Add-Type -TypeDefinition $src -Language CSharp
[WinKeyBlocker]::Main()
`;

  // Use spawn — the process stays alive (message loop)
  winKeyHookProcess = spawn(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', ps],
    { windowsHide: true, detached: false }
  );

  winKeyHookProcess.on('error', () => { winKeyHookProcess = null; });
  winKeyHookProcess.on('exit',  () => { winKeyHookProcess = null; });
}

function restoreWinKey() {
  if (process.platform !== 'win32') return;
  if (winKeyHookProcess) {
    winKeyHookProcess.kill();
    winKeyHookProcess = null;
  }
}

// ---------------------------------------------------------------------------
// createLauncherWindow
// ---------------------------------------------------------------------------

function createLauncherWindow() {
  launcherWindow = new BrowserWindow({
    width: 420,
    height: 640,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Grant camera permission in launcher so renderer can call getUserMedia
  // for device enumeration (enumerateCameras in renderer.js).
  // Without this, Electron denies the request by default and the camera
  // list stays empty — selector never appears.
  launcherWindow.webContents.session.setPermissionRequestHandler(
    (_wc, permission, callback) => {
      callback(permission === 'media');
    }
  );

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
  // selectedCameraDeviceId is stored for future use (e.g. passing to CBT site via query param)
  void selectedCameraDeviceId;
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
  // Receive camera list from renderer before validation runs
  ipcMain.handle('report-camera-result', (_event, cameras) => {
    rendererCameraList = Array.isArray(cameras) ? cameras : [];
  });

  // Run device validation — pass renderer-provided camera list if available
  ipcMain.handle('run-validation', async () => {
    try {
      return await validator.runAll(rendererCameraList);
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

  // Auto-update: update-electron-app handles autoUpdater events internally.
  // We only need to handle install-update IPC from renderer.
  ipcMain.handle('install-update', () => {
    if (app.isPackaged) {
      const { autoUpdater } = require('electron');
      autoUpdater.quitAndInstall();
    }
  });

  // System info — return OS, CPU, RAM, arch for spec display
  ipcMain.handle('get-system-info', () => {
    const os = require('os');
    return {
      platform: os.platform(),
      release: os.release(),
      cpus: os.cpus(),
      totalmem: os.totalmem(),
      arch: os.arch(),
    };
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
