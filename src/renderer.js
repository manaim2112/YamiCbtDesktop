'use strict';

// ── SVG icons ──────────────────────────────────────────────────────────────

const ICON_CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
  <polyline points="20 6 9 17 4 12"/>
</svg>`;

const ICON_X = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
</svg>`;

const ICON_SPIN = `<svg class="icon-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
</svg>`;

// ── State ──────────────────────────────────────────────────────────────────

/** @type {string|null} deviceId kamera yang dipilih */
let selectedCameraId = null;

// ── Helpers ────────────────────────────────────────────────────────────────

function getElementId(type) {
  return { internet: 'check-internet', camera: 'check-camera', hardware: 'check-hardware' }[type];
}

function setChecking(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = 'check-item checking';
  el.querySelector('.check-msg').textContent = 'Memeriksa...';
  el.querySelector('.check-badge').innerHTML = ICON_SPIN;
}

function setResult(id, passed, message) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = 'check-item ' + (passed ? 'pass' : 'fail');
  el.querySelector('.check-msg').textContent = message;
  el.querySelector('.check-badge').innerHTML = passed ? ICON_CHECK : ICON_X;
}

function updateStartButton(allPassed) {
  const btn  = document.getElementById('btn-start');
  const note = document.getElementById('validation-note');
  btn.disabled = !allPassed;
  note.hidden  = allPassed;
}

// ── Camera selector ────────────────────────────────────────────────────────

/**
 * Enumerate video input devices using the browser's mediaDevices API.
 * Returns an array of { deviceId, label }.
 * Requires a getUserMedia grant first to get labelled devices.
 */
async function enumerateCameras() {
  try {
    // Request a brief stream just to unlock labelled device enumeration
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    stream.getTracks().forEach((t) => t.stop()); // release immediately

    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'videoinput')
      .map((d, i) => ({
        deviceId: d.deviceId,
        label: d.label || `Kamera ${i + 1}`,
      }));
  } catch {
    return [];
  }
}

/**
 * Populate the camera <select> and show it when there are ≥2 cameras.
 * If only 1 camera, auto-select it silently.
 */
async function setupCameraSelector(cameras) {
  const wrap   = document.getElementById('camera-select-wrap');
  const select = document.getElementById('camera-select');

  if (cameras.length === 0) return;

  // Auto-select first camera regardless
  selectedCameraId = cameras[0].deviceId;

  if (cameras.length < 2) {
    // Only one camera — no need to show selector
    wrap.hidden = true;
    return;
  }

  // Populate options
  select.innerHTML = '';
  cameras.forEach(({ deviceId, label }) => {
    const opt = document.createElement('option');
    opt.value = deviceId;
    opt.textContent = label;
    select.appendChild(opt);
  });

  select.value = selectedCameraId;
  wrap.hidden = false;

  select.addEventListener('change', () => {
    selectedCameraId = select.value;
  });
}

// ── Validation summary handler ─────────────────────────────────────────────

async function handleSummary(summary) {
  if (!summary || !Array.isArray(summary.results)) return;

  summary.results.forEach(({ type, passed, message }) => {
    const id = getElementId(type);
    if (id) setResult(id, passed, message);
  });

  // If camera passed, enumerate devices for selector
  const cameraResult = summary.results.find((r) => r.type === 'camera');
  if (cameraResult && cameraResult.passed) {
    const cameras = await enumerateCameras();
    await setupCameraSelector(cameras);
  }

  updateStartButton(summary.allPassed === true);
}

// ── Auto-update banner ─────────────────────────────────────────────────────

function setupUpdateListener() {
  window.electronAPI.onUpdateStatus((info) => {
    const banner  = document.getElementById('update-banner');
    const text    = document.getElementById('update-text');
    const btn     = document.getElementById('update-btn');

    banner.hidden = false;

    if (info.status === 'available') {
      text.textContent = 'Pembaruan tersedia, sedang mengunduh...';
      btn.hidden = true;
    } else if (info.status === 'downloaded') {
      text.textContent = 'Pembaruan siap dipasang.';
      btn.hidden = false;
    } else if (info.status === 'up-to-date') {
      text.textContent = 'Aplikasi sudah versi terbaru.';
      btn.hidden = true;
      // Auto-hide after 4 seconds
      setTimeout(() => { banner.hidden = true; }, 4000);
    } else if (info.status === 'error') {
      text.textContent = 'Gagal memeriksa pembaruan.';
      btn.hidden = true;
      setTimeout(() => { banner.hidden = true; }, 4000);
    }
  });

  document.getElementById('update-btn').addEventListener('click', () => {
    window.electronAPI.installUpdate();
  });
}

// ── Main init ──────────────────────────────────────────────────────────────

async function init() {
  // Show app version
  const verEl = document.getElementById('app-version');
  if (verEl) {
    // process.env.npm_package_version is not available in renderer;
    // we read it from the title attribute set by main, or leave blank.
    verEl.textContent = '';
  }

  // Set all checks to loading state
  ['check-internet', 'check-camera', 'check-hardware'].forEach(setChecking);

  // Listen for push-based validation results
  window.electronAPI.onValidationResult(handleSummary);

  // Listen for update events
  setupUpdateListener();

  // Run validation
  try {
    const summary = await window.electronAPI.runValidation();
    await handleSummary(summary);
  } catch {
    ['check-internet', 'check-camera', 'check-hardware'].forEach((id) => {
      setResult(id, false, 'Gagal menjalankan pemeriksaan');
    });
    updateStartButton(false);
  }
}

// ── Start button ───────────────────────────────────────────────────────────

document.getElementById('btn-start').addEventListener('click', () => {
  window.electronAPI.startExam(selectedCameraId);
});

// ── Boot ───────────────────────────────────────────────────────────────────

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
