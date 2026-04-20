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

/** @type {MediaStream|null} stream preview kamera aktif */
let previewStream = null;

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

// ── Branding ──────────────────────────────────────────────────────────────

/**
 * Load branding (name, tagline, logo) from main process constants.
 * Allows customisation without touching HTML.
 */
async function loadBranding() {
  try {
    const b = await window.electronAPI.getBranding();

    if (b.name) {
      const el = document.getElementById('brand-name');
      if (el) el.textContent = b.name;
    }

    if (b.tagline) {
      const el = document.getElementById('brand-tagline');
      if (el) el.textContent = b.tagline;
    }

    // Replace default SVG logo with an <img> if APP_LOGO is set
    if (b.logo) {
      const wrap = document.getElementById('brand-logo');
      if (wrap) {
        const img = document.createElement('img');
        img.src = b.logo;
        img.alt = b.name || 'Logo';
        img.onerror = () => { /* keep SVG fallback if image fails */ };
        wrap.innerHTML = '';
        wrap.appendChild(img);
      }
    }
  } catch {
    // Non-critical — HTML defaults remain
  }
}

// ── Spec strip ────────────────────────────────────────────────────────────

/**
 * Populate the device spec strip with OS, CPU model, RAM, and arch.
 */
async function loadSpecStrip() {
  try {
    const info = await window.electronAPI.getSystemInfo();

    // OS label
    const osMap = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' };
    const osLabel = osMap[info.platform] || info.platform;
    // Extract major version from release string (e.g. "10.0.22631" → "10")
    const osMajor = info.release ? info.release.split('.')[0] : '';
    document.getElementById('spec-os').textContent =
      osMajor ? `${osLabel} ${osMajor}` : osLabel;

    // CPU — use first CPU model, strip redundant text
    if (info.cpus && info.cpus.length > 0) {
      let cpuModel = info.cpus[0].model
        .replace(/\(R\)|\(TM\)|CPU|@.*/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (cpuModel.length > 18) cpuModel = cpuModel.slice(0, 17) + '…';
      document.getElementById('spec-cpu').textContent = cpuModel;
    }

    // RAM — total in GB
    const ramGB = (info.totalmem / (1024 ** 3)).toFixed(1);
    document.getElementById('spec-ram').textContent = `${ramGB} GB`;

    // Arch
    document.getElementById('spec-arch').textContent = info.arch || '—';
  } catch {
    // Non-critical — leave dashes if it fails
  }
}

// ── Camera preview ────────────────────────────────────────────────────────

/**
 * Start live camera preview in the thumbnail using the selected deviceId.
 */
async function startCameraPreview(deviceId) {
  const video       = document.getElementById('camera-preview');
  const placeholder = document.getElementById('cam-thumb-placeholder');
  if (!video) return;

  // Stop any existing stream
  if (previewStream) {
    previewStream.getTracks().forEach((t) => t.stop());
    previewStream = null;
    video.classList.remove('active');
  }

  if (!deviceId) return;

  try {
    const constraints = { video: { deviceId: { exact: deviceId } }, audio: false };
    previewStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = previewStream;
    video.classList.add('active');
    if (placeholder) placeholder.style.display = 'none';
  } catch {
    // Preview failed — not critical, validation still works
    if (placeholder) placeholder.style.display = '';
  }
}

// ── Camera selector ────────────────────────────────────────────────────────

/**
 * Enumerate video input devices using the browser's mediaDevices API.
 * Returns an array of { deviceId, label }.
 * Requires a getUserMedia grant first to get labelled devices.
 */
async function enumerateCameras() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    stream.getTracks().forEach((t) => t.stop());

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
 * Populate the camera selector row.
 * Shows for ≥1 camera so user can always confirm which camera is active.
 */
async function setupCameraSelector(cameras) {
  const wrap   = document.getElementById('camera-select-wrap');
  const select = document.getElementById('camera-select');

  if (cameras.length === 0) {
    wrap.hidden = true;
    return;
  }

  selectedCameraId = cameras[0].deviceId;

  select.innerHTML = '';
  cameras.forEach(({ deviceId, label }) => {
    const opt = document.createElement('option');
    opt.value = deviceId;
    opt.textContent = label;
    select.appendChild(opt);
  });

  select.value = selectedCameraId;
  wrap.hidden = false;

  await startCameraPreview(selectedCameraId);

  select.addEventListener('change', async () => {
    selectedCameraId = select.value;
    await startCameraPreview(selectedCameraId);
  });
}

// ── Validation summary handler ─────────────────────────────────────────────

async function handleSummary(summary) {
  if (!summary || !Array.isArray(summary.results)) return;

  summary.results.forEach(({ type, passed, message }) => {
    const id = getElementId(type);
    if (id) setResult(id, passed, message);
  });

  updateStartButton(summary.allPassed === true);
}

// ── Auto-update banner ─────────────────────────────────────────────────────

function setupUpdateListener() {
  window.electronAPI.onUpdateStatus((info) => {
    const banner = document.getElementById('update-banner');
    const text   = document.getElementById('update-text');
    const btn    = document.getElementById('update-btn');

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
  // Load branding from constants (non-blocking)
  loadBranding();

  // Load device spec strip (non-blocking)
  loadSpecStrip();

  // Set all checks to loading state
  ['check-internet', 'check-camera', 'check-hardware'].forEach(setChecking);

  // Listen for push-based validation results
  window.electronAPI.onValidationResult(handleSummary);

  // Listen for update events
  setupUpdateListener();

  // Enumerate cameras FIRST — only renderer has mediaDevices access
  const cameras = await enumerateCameras();
  await setupCameraSelector(cameras);
  await window.electronAPI.reportCameraResult(cameras);

  // Run validation (main process now has camera list from reportCameraResult)
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
