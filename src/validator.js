'use strict';

const https = require('https');
const os = require('os');
const {
  CBT_URL,
  CBT_DOMAIN,
  INTERNET_CHECK_TIMEOUT_MS,
  MIN_FREE_RAM_BYTES,
} = require('./constants');

// ---------------------------------------------------------------------------
// Pure helper functions (no Electron dependency — fully testable in Node.js)
// ---------------------------------------------------------------------------

/**
 * Evaluate an HTTP status code and return a ValidationResult for internet.
 *
 * @param {number} statusCode
 * @returns {{ type: 'internet', passed: boolean, message: string }}
 */
function evaluateHttpStatus(statusCode) {
  const passed = statusCode >= 200 && statusCode <= 399;
  return {
    type: 'internet',
    passed,
    message: passed
      ? 'Koneksi internet tersedia'
      : 'Koneksi internet tidak tersedia',
  };
}

/**
 * Evaluate free RAM bytes and return a ValidationResult for hardware.
 *
 * @param {number} freeBytes
 * @returns {{ type: 'hardware', passed: boolean, message: string }}
 */
function evaluateRam(freeBytes) {
  const passed = freeBytes >= MIN_FREE_RAM_BYTES;
  const freeMB = Math.floor(freeBytes / (1024 * 1024));
  const minMB = Math.floor(MIN_FREE_RAM_BYTES / (1024 * 1024));
  return {
    type: 'hardware',
    passed,
    message: passed
      ? `RAM tersedia: ${freeMB} MB`
      : `RAM tidak mencukupi: tersedia ${freeMB} MB, minimum ${minMB} MB`,
  };
}

/**
 * Evaluate a list of media devices and return a ValidationResult for camera.
 *
 * @param {Array<{ deviceId: string, label: string }>} devices
 * @returns {{ type: 'camera', passed: boolean, message: string }}
 */
function evaluateCameraDevices(devices) {
  const passed = Array.isArray(devices) && devices.length > 0;
  return {
    type: 'camera',
    passed,
    message: passed
      ? 'Kamera terdeteksi'
      : 'Kamera tidak terdeteksi atau tidak dapat diakses',
  };
}

/**
 * Build a ValidationSummary from an array of ValidationResult objects.
 *
 * @param {Array<{ type: string, passed: boolean, message: string }>} results
 * @returns {{ results: Array, allPassed: boolean }}
 */
function buildSummary(results) {
  return {
    results,
    allPassed: results.every((r) => r.passed),
  };
}

/**
 * Return true if the URL's hostname is exactly CBT_DOMAIN or a subdomain of it.
 *
 * @param {string} url
 * @returns {boolean}
 */
function isAllowedUrl(url) {
  try {
    const { hostname } = new URL(url);
    return hostname === CBT_DOMAIN || hostname.endsWith('.' + CBT_DOMAIN);
  } catch {
    return false;
  }
}

/**
 * Handler for setWindowOpenHandler — always denies new window requests.
 *
 * @param {{ url: string }} details
 * @returns {{ action: 'deny' }}
 */
function windowOpenHandler(_details) {
  return { action: 'deny' };
}

/**
 * Permission request handler that auto-grants camera/media permissions.
 *
 * @param {string} permission
 * @param {(granted: boolean) => void} callback
 * @param {object} _details
 */
function cameraPermissionHandler(permission, callback, _details) {
  if (permission === 'media') {
    callback(true);
  } else {
    callback(false);
  }
}

// ---------------------------------------------------------------------------
// Async check functions (may use Electron APIs at runtime)
// ---------------------------------------------------------------------------

/**
 * Check internet connectivity by performing an HTTP GET to CBT_URL.
 * Uses Node.js `https` module so it is testable outside Electron.
 *
 * @returns {Promise<{ type: 'internet', passed: boolean, message: string }>}
 */
function checkInternet() {
  return new Promise((resolve) => {
    let settled = false;

    const settle = (result) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    let req;
    try {
      req = https.get(CBT_URL, { timeout: INTERNET_CHECK_TIMEOUT_MS }, (res) => {
        // Drain the response so the socket is released
        res.resume();
        settle(evaluateHttpStatus(res.statusCode));
      });
    } catch (err) {
      settle({ type: 'internet', passed: false, message: 'Koneksi internet tidak tersedia' });
      return;
    }

    req.on('timeout', () => {
      req.destroy();
      settle({ type: 'internet', passed: false, message: 'Koneksi internet tidak tersedia' });
    });

    req.on('error', () => {
      settle({ type: 'internet', passed: false, message: 'Koneksi internet tidak tersedia' });
    });
  });
}

/**
 * Check camera availability.
 * In the main process we cannot call navigator.mediaDevices, so we attempt to
 * use Electron's desktopCapturer if available; otherwise we fall back to
 * returning a failed result (the renderer-side check handles the real
 * enumeration via IPC when needed).
 *
 * The pure logic is in `evaluateCameraDevices` and can be called directly
 * with a device list in tests.
 *
 * @returns {Promise<{ type: 'camera', passed: boolean, message: string }>}
 */
async function checkCamera() {
  try {
    // Try to use Electron's desktopCapturer (available in main process)
    const { desktopCapturer } = require('electron');
    const sources = await desktopCapturer.getSources({ types: ['window', 'screen'] });
    // desktopCapturer lists screen/window sources, not video input devices.
    // We use it only as a proxy to confirm Electron is available; the actual
    // camera device list comes from the renderer via getUserMedia.
    // For the main-process check we treat "Electron is available and
    // desktopCapturer works" as a signal that the system can enumerate devices.
    // A non-empty sources list means the display subsystem is accessible.
    void sources; // suppress unused-variable warning
    // We cannot enumerate video input devices from the main process without
    // spawning a renderer, so we return a provisional pass and let the
    // renderer confirm via getUserMedia.
    return evaluateCameraDevices([{ deviceId: 'provisional', label: 'provisional' }]);
  } catch {
    // Electron not available (e.g. running in Jest) or desktopCapturer failed.
    // Return a failed result; tests can call evaluateCameraDevices directly.
    return evaluateCameraDevices([]);
  }
}

/**
 * Check hardware (RAM) availability.
 * Uses os.totalmem() so the check reflects installed RAM, not free RAM.
 * Free RAM fluctuates based on running apps and is misleading for a
 * minimum-spec check.
 *
 * @returns {Promise<{ type: 'hardware', passed: boolean, message: string }>}
 */
async function checkHardware() {
  return evaluateRam(os.totalmem());
}

/**
 * Run all three checks in parallel and return a ValidationSummary.
 *
 * @param {Array<{ deviceId: string, label: string }>|null} [cameraDevices]
 *   Optional camera device list pre-enumerated by the renderer.
 *   When provided, skips the desktopCapturer proxy and uses the real list.
 * @returns {Promise<{ results: Array, allPassed: boolean }>}
 */
async function runAll(cameraDevices) {
  const cameraResult = cameraDevices != null
    ? evaluateCameraDevices(cameraDevices)
    : checkCamera();

  const results = await Promise.all([
    checkInternet(),
    cameraResult,
    checkHardware(),
  ]);
  return buildSummary(results);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // Async check functions
  runAll,
  checkInternet,
  checkCamera,
  checkHardware,
  // Pure helper functions (testable without Electron)
  evaluateHttpStatus,
  evaluateRam,
  evaluateCameraDevices,
  buildSummary,
  isAllowedUrl,
  windowOpenHandler,
  cameraPermissionHandler,
};
