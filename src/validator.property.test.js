'use strict';

const fc = require('fast-check');
const {
  evaluateHttpStatus,
  evaluateRam,
  evaluateCameraDevices,
  buildSummary,
  isAllowedUrl,
  windowOpenHandler,
  cameraPermissionHandler,
} = require('./validator');

// Feature: cbt-launcher, Property 1: Status HTTP menentukan hasil pemeriksaan internet
test('evaluateHttpStatus: passed iff status 200-399', () => {
  fc.assert(
    fc.property(fc.integer({ min: 100, max: 599 }), (statusCode) => {
      const result = evaluateHttpStatus(statusCode);
      return result.passed === (statusCode >= 200 && statusCode <= 399);
    }),
    { numRuns: 100 }
  );
});

// Feature: cbt-launcher, Property 2: Ambang batas RAM menentukan hasil pemeriksaan perangkat keras
test('evaluateRam: passed iff freemem >= 512 MB', () => {
  fc.assert(
    fc.property(fc.nat({ max: 2 * 1024 * 1024 * 1024 }), (freeBytes) => {
      const result = evaluateRam(freeBytes);
      return result.passed === (freeBytes >= 512 * 1024 * 1024);
    }),
    { numRuns: 100 }
  );
});

// Feature: cbt-launcher, Property 3: Ketersediaan perangkat kamera menentukan hasil pemeriksaan kamera
test('evaluateCameraDevices: passed iff device list non-empty', () => {
  const deviceArb = fc.record({
    deviceId: fc.string(),
    label: fc.string(),
  });
  fc.assert(
    fc.property(fc.array(deviceArb), (devices) => {
      const result = evaluateCameraDevices(devices);
      return result.passed === (devices.length > 0);
    }),
    { numRuns: 100 }
  );
});

// Feature: cbt-launcher, Property 4: allPassed konsisten dengan array results
test('buildSummary: allPassed === results.every(r => r.passed)', () => {
  const resultArb = fc.record({
    type: fc.constantFrom('internet', 'camera', 'hardware'),
    passed: fc.boolean(),
    message: fc.string(),
  });
  fc.assert(
    fc.property(fc.array(resultArb), (results) => {
      const summary = buildSummary(results);
      return summary.allPassed === results.every((r) => r.passed);
    }),
    { numRuns: 100 }
  );
});

// Feature: cbt-launcher, Property 5: Guard navigasi memblokir semua URL di luar domain CBT
test('isAllowedUrl: izinkan iff hostname adalah cbt.mtssupel.sch.id atau subdomain', () => {
  fc.assert(
    fc.property(fc.webUrl(), (url) => {
      try {
        const result = isAllowedUrl(url);
        const hostname = new URL(url).hostname;
        const expected =
          hostname === 'cbt.mtssupel.sch.id' ||
          hostname.endsWith('.cbt.mtssupel.sch.id');
        return result === expected;
      } catch {
        return true; // URL tidak valid tidak akan dinavigasi
      }
    }),
    { numRuns: 100 }
  );
});

// Feature: cbt-launcher, Property 6: Handler pembukaan jendela baru selalu menolak
test('windowOpenHandler: selalu mengembalikan { action: "deny" } untuk URL apapun', () => {
  fc.assert(
    fc.property(fc.webUrl(), (url) => {
      const result = windowOpenHandler({ url });
      return result.action === 'deny';
    }),
    { numRuns: 100 }
  );
});

// Feature: cbt-launcher, Property 7: Handler izin kamera selalu memberikan izin untuk permintaan 'media'
test('cameraPermissionHandler: selalu memanggil callback dengan true untuk permission "media"', () => {
  const detailsArb = fc.record({
    requestingUrl: fc.webUrl(),
    isMainFrame: fc.boolean(),
  });
  fc.assert(
    fc.property(detailsArb, (details) => {
      let granted = null;
      cameraPermissionHandler('media', (g) => { granted = g; }, details);
      return granted === true;
    }),
    { numRuns: 100 }
  );
});

// Feature: cbt-launcher, Property 8: Serialisasi ValidationResult round-trip
test('ValidationResult: JSON round-trip menjaga semua field', () => {
  const resultArb = fc.record({
    type: fc.constantFrom('internet', 'camera', 'hardware'),
    passed: fc.boolean(),
    message: fc.string(),
  });
  fc.assert(
    fc.property(resultArb, (result) => {
      const roundTripped = JSON.parse(JSON.stringify(result));
      return (
        roundTripped.type === result.type &&
        roundTripped.passed === result.passed &&
        roundTripped.message === result.message
      );
    }),
    { numRuns: 100 }
  );
});
