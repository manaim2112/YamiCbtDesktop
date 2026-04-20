'use strict';

const {
  evaluateHttpStatus,
  evaluateRam,
  evaluateCameraDevices,
  buildSummary,
  isAllowedUrl,
} = require('./validator');

// ---------------------------------------------------------------------------
// 3.1 evaluateHttpStatus
// ---------------------------------------------------------------------------

describe('evaluateHttpStatus', () => {
  test('status 200 harus lulus', () => {
    const result = evaluateHttpStatus(200);
    expect(result.type).toBe('internet');
    expect(result.passed).toBe(true);
    expect(result.message).toBe('Koneksi internet tersedia');
  });

  test('status 399 (batas atas lulus) harus lulus', () => {
    const result = evaluateHttpStatus(399);
    expect(result.type).toBe('internet');
    expect(result.passed).toBe(true);
    expect(result.message).toBe('Koneksi internet tersedia');
  });

  test('status 400 (batas bawah gagal) harus gagal', () => {
    const result = evaluateHttpStatus(400);
    expect(result.type).toBe('internet');
    expect(result.passed).toBe(false);
    expect(result.message).toBe('Koneksi internet tidak tersedia');
  });

  test('status 500 harus gagal', () => {
    const result = evaluateHttpStatus(500);
    expect(result.type).toBe('internet');
    expect(result.passed).toBe(false);
    expect(result.message).toBe('Koneksi internet tidak tersedia');
  });
});

// ---------------------------------------------------------------------------
// 3.2 evaluateRam
// ---------------------------------------------------------------------------

const MB_512 = 512 * 1024 * 1024; // 536870912
const MB_511 = 511 * 1024 * 1024; // 535822336
const GB_1   = 1024 * 1024 * 1024; // 1073741824

describe('evaluateRam', () => {
  test('tepat 512 MB harus lulus', () => {
    const result = evaluateRam(MB_512);
    expect(result.type).toBe('hardware');
    expect(result.passed).toBe(true);
    expect(result.message).toContain('512');
  });

  test('511 MB harus gagal', () => {
    const result = evaluateRam(MB_511);
    expect(result.type).toBe('hardware');
    expect(result.passed).toBe(false);
    expect(result.message).toContain('511');
    expect(result.message).toContain('512');
  });

  test('0 byte harus gagal', () => {
    const result = evaluateRam(0);
    expect(result.type).toBe('hardware');
    expect(result.passed).toBe(false);
    expect(result.message).toContain('0');
  });

  test('1 GB harus lulus', () => {
    const result = evaluateRam(GB_1);
    expect(result.type).toBe('hardware');
    expect(result.passed).toBe(true);
    expect(result.message).toContain('1024');
  });
});

// ---------------------------------------------------------------------------
// 3.3 evaluateCameraDevices
// ---------------------------------------------------------------------------

describe('evaluateCameraDevices', () => {
  test('daftar kosong harus gagal', () => {
    const result = evaluateCameraDevices([]);
    expect(result.type).toBe('camera');
    expect(result.passed).toBe(false);
    expect(result.message).toBe('Kamera tidak terdeteksi atau tidak dapat diakses');
  });

  test('satu kamera harus lulus', () => {
    const result = evaluateCameraDevices([{ deviceId: 'cam1', label: 'Webcam HD' }]);
    expect(result.type).toBe('camera');
    expect(result.passed).toBe(true);
    expect(result.message).toBe('Kamera terdeteksi');
  });

  test('banyak kamera harus lulus', () => {
    const devices = [
      { deviceId: 'cam1', label: 'Webcam HD' },
      { deviceId: 'cam2', label: 'Kamera Belakang' },
      { deviceId: 'cam3', label: 'Kamera Virtual' },
    ];
    const result = evaluateCameraDevices(devices);
    expect(result.type).toBe('camera');
    expect(result.passed).toBe(true);
    expect(result.message).toBe('Kamera terdeteksi');
  });
});

// ---------------------------------------------------------------------------
// 3.4 buildSummary
// ---------------------------------------------------------------------------

describe('buildSummary', () => {
  const pass = (type) => ({ type, passed: true, message: 'ok' });
  const fail = (type) => ({ type, passed: false, message: 'gagal' });

  test('semua lulus — allPassed harus true', () => {
    const results = [pass('internet'), pass('camera'), pass('hardware')];
    const summary = buildSummary(results);
    expect(summary.allPassed).toBe(true);
    expect(summary.results).toBe(results);
  });

  test('semua gagal — allPassed harus false', () => {
    const results = [fail('internet'), fail('camera'), fail('hardware')];
    const summary = buildSummary(results);
    expect(summary.allPassed).toBe(false);
    expect(summary.results).toBe(results);
  });

  test('campuran (satu gagal) — allPassed harus false', () => {
    const results = [pass('internet'), fail('camera'), pass('hardware')];
    const summary = buildSummary(results);
    expect(summary.allPassed).toBe(false);
    expect(summary.results).toBe(results);
  });

  test('campuran (dua lulus, satu gagal) — allPassed harus false', () => {
    const results = [pass('internet'), pass('camera'), fail('hardware')];
    const summary = buildSummary(results);
    expect(summary.allPassed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3.5 isAllowedUrl
// ---------------------------------------------------------------------------

const CBT_DOMAIN = 'cbt.mtssupel.sch.id';

describe('isAllowedUrl', () => {
  test('domain tepat harus diizinkan', () => {
    expect(isAllowedUrl(`https://${CBT_DOMAIN}`)).toBe(true);
    expect(isAllowedUrl(`https://${CBT_DOMAIN}/ujian/login`)).toBe(true);
  });

  test('subdomain valid harus diizinkan', () => {
    expect(isAllowedUrl(`https://sub.${CBT_DOMAIN}`)).toBe(true);
    expect(isAllowedUrl(`https://api.${CBT_DOMAIN}/v1`)).toBe(true);
  });

  test('domain berbeda harus ditolak', () => {
    expect(isAllowedUrl('https://evil.com')).toBe(false);
    expect(isAllowedUrl('https://mtssupel.sch.id')).toBe(false);
    expect(isAllowedUrl(`https://fake-${CBT_DOMAIN}`)).toBe(false);
  });

  test('URL malformed harus ditolak', () => {
    expect(isAllowedUrl('not-a-url')).toBe(false);
    expect(isAllowedUrl('')).toBe(false);
    expect(isAllowedUrl('://missing-protocol')).toBe(false);
  });
});
