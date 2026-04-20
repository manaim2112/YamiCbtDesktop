# Dokumen Desain: CBT Launcher

## Ikhtisar

CBT Launcher adalah fitur inti dari **yamicbtdesktop** yang mengubah aplikasi Electron scaffold menjadi peluncur ujian berbasis komputer (CBT) yang aman. Fitur ini terdiri dari dua fase utama:

1. **Fase Validasi** — Launcher_Window menampilkan UI validasi perangkat dan menjalankan pemeriksaan internet, kamera, dan RAM secara paralel.
2. **Fase Ujian** — Setelah semua validasi lulus dan pengguna menekan Mulai, Launcher_Window ditutup dan CBT_Window dibuka dalam mode kiosk penuh yang terkunci.

Seluruh komunikasi antara main process dan renderer dilakukan melalui `contextBridge` di `preload.js`, tanpa `nodeIntegration`. Pintasan global Ctrl+Y+A memanggil `app.quit()` kapan saja selama sesi ujian.

---

## Arsitektur

### Gambaran Proses Electron

```
┌─────────────────────────────────────────────────────────────────┐
│                        Main Process (Node.js)                   │
│                                                                 │
│  ┌──────────────┐    ┌──────────────────┐    ┌──────────────┐  │
│  │  index.js    │    │  validator.js    │    │  ipcMain     │  │
│  │  (app entry) │───▶│  (checks: net,  │    │  handlers    │  │
│  │              │    │   camera, RAM)   │    │              │  │
│  └──────┬───────┘    └──────────────────┘    └──────┬───────┘  │
│         │                                           │          │
└─────────┼───────────────────────────────────────────┼──────────┘
          │ creates                                   │ IPC
          ▼                                           ▼
┌─────────────────────┐                 ┌─────────────────────────┐
│   Launcher_Window   │                 │      CBT_Window         │
│   (BrowserWindow)   │                 │   (BrowserWindow)       │
│                     │                 │   kiosk + fullscreen    │
│  ┌───────────────┐  │                 │                         │
│  │  preload.js   │  │                 │  ┌───────────────────┐  │
│  │ (contextBridge│  │                 │  │  preload.js       │  │
│  │  API bridge)  │  │                 │  │  (contextBridge   │  │
│  └───────────────┘  │                 │  │   API bridge)     │  │
│                     │                 │  └───────────────────┘  │
│  ┌───────────────┐  │                 │                         │
│  │  index.html   │  │                 │  loads CBT_URL          │
│  │  (validator   │  │                 │  https://cbt.mtssupel   │
│  │   UI)         │  │                 │  .sch.id                │
│  └───────────────┘  │                 └─────────────────────────┘
└─────────────────────┘
```

### Alur Aplikasi

```
app.whenReady()
      │
      ▼
createLauncherWindow()
      │
      ▼
Renderer memanggil runValidation()
      │
      ▼
ipcMain menjalankan validator.runAll() [paralel]
  ├── checkInternet()   → HTTP GET CBT_URL, timeout 10s
  ├── checkCamera()     → enumerateDevices via desktopCapturer / session
  └── checkHardware()   → os.freemem() ≥ 512 MB
      │
      ▼
ipcMain mengirim 'validation-result' ke Launcher_Window
      │
      ▼
Renderer menampilkan hasil; tombol Mulai aktif jika semua lulus
      │
      ▼ (pengguna klik Mulai)
Renderer memanggil startExam()
      │
      ▼
ipcMain menutup Launcher_Window, membuka CBT_Window (kiosk)
      │
      ▼
CBT_Window memuat CBT_URL
  ├── Sukses → sesi ujian aktif
  └── Gagal  → inject halaman error dengan tombol Coba Lagi
```

---

## Komponen dan Antarmuka

### 1. `src/index.js` — Main Process Entry

Tanggung jawab:
- Membuat `Launcher_Window` saat `app.whenReady()`
- Mendaftarkan global shortcut Ctrl+Y+A → `app.quit()`
- Mendaftarkan semua handler `ipcMain`
- Mengimpor dan menggunakan `validator.js`
- Membuat `CBT_Window` saat menerima sinyal `start-exam`

**Fungsi utama:**

```js
// Membuat Launcher_Window
function createLauncherWindow()

// Membuat CBT_Window dengan kiosk + permission pre-grant
function createCbtWindow()

// Mendaftarkan global shortcut Ctrl+Y+A
function registerExitShortcut()

// Mendaftarkan semua ipcMain handlers
function registerIpcHandlers()
```

### 2. `src/validator.js` — Modul Validator (Main Process)

Modul baru yang diekspor sebagai CommonJS. Menjalankan tiga pemeriksaan secara paralel menggunakan `Promise.all`.

**Antarmuka yang diekspor:**

```js
/**
 * Menjalankan semua pemeriksaan validasi secara paralel.
 * @returns {Promise<ValidationResult[]>}
 */
async function runAll()

/**
 * Memeriksa koneksi internet dengan HTTP GET ke CBT_URL.
 * Timeout: 10 detik.
 * @returns {Promise<ValidationResult>}
 */
async function checkInternet()

/**
 * Memeriksa ketersediaan kamera menggunakan desktopCapturer
 * atau enumerasi perangkat media.
 * @returns {Promise<ValidationResult>}
 */
async function checkCamera()

/**
 * Memeriksa RAM bebas ≥ 512 MB menggunakan os.freemem().
 * @returns {Promise<ValidationResult>}
 */
async function checkHardware()

module.exports = { runAll, checkInternet, checkCamera, checkHardware };
```

### 3. `src/preload.js` — Preload Bridge

Mengekspos API aman ke renderer melalui `contextBridge.exposeInMainWorld('electronAPI', {...})`.

**API yang diekspos:**

```js
window.electronAPI = {
  // Memicu validasi perangkat di main process
  runValidation: () => ipcRenderer.invoke('run-validation'),

  // Memicu pembukaan CBT_Window
  startExam: () => ipcRenderer.invoke('start-exam'),

  // Mendaftarkan callback untuk menerima hasil validasi
  onValidationResult: (callback) =>
    ipcRenderer.on('validation-result', (_event, result) => callback(result)),

  // Mendaftarkan callback untuk notifikasi sesi ujian berakhir
  onExamEnded: (callback) =>
    ipcRenderer.on('exam-ended', (_event) => callback()),
};
```

### 4. `src/index.html` + `src/renderer.js` — Launcher UI (Renderer)

Halaman HTML yang menampilkan tiga item validasi dan tombol Mulai. Logika renderer ditulis di `src/renderer.js` yang di-load oleh `index.html`.

**Elemen UI:**

| Elemen | ID | Deskripsi |
|---|---|---|
| Item internet | `#check-internet` | Status + pesan koneksi |
| Item kamera | `#check-camera` | Status + pesan kamera |
| Item hardware | `#check-hardware` | Status + pesan RAM |
| Tombol Mulai | `#btn-start` | Diaktifkan jika semua lulus |
| Keterangan | `#validation-note` | Pesan jika ada yang gagal |

**Status indikator per item:**
- `checking` — menampilkan "Memeriksa..."
- `pass` — ikon ✓ hijau + pesan sukses
- `fail` — ikon ✗ merah + pesan error deskriptif

### 5. CBT_Window — Konfigurasi dan Guard

CBT_Window dibuat dengan opsi berikut:

```js
new BrowserWindow({
  fullscreen: true,
  kiosk: true,
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    nodeIntegration: false,
    contextIsolation: true,
  },
})
```

**Guard yang dipasang pada CBT_Window:**

| Guard | Mekanisme |
|---|---|
| Blokir navigasi luar domain | `webContents.on('will-navigate', ...)` |
| Blokir buka jendela baru | `webContents.setWindowOpenHandler(...)` |
| Nonaktifkan menu konteks | `webContents.on('context-menu', e => e.preventDefault())` |
| Blokir keyboard berbahaya | `webContents.on('before-input-event', ...)` |
| Pre-grant izin kamera | `session.setPermissionRequestHandler(...)` |
| Inject halaman error | `webContents.on('did-fail-load', ...)` |

---

## Model Data

### `ValidationResult`

Objek yang dikembalikan oleh setiap fungsi pemeriksaan di `validator.js` dan dikirim ke renderer.

```js
/**
 * @typedef {Object} ValidationResult
 * @property {'internet'|'camera'|'hardware'} type  - Jenis pemeriksaan
 * @property {boolean} passed                        - true jika lulus
 * @property {string} message                        - Pesan deskriptif untuk UI
 */
```

Contoh nilai:

```js
// Lulus
{ type: 'internet', passed: true,  message: 'Koneksi internet tersedia' }
{ type: 'camera',   passed: true,  message: 'Kamera terdeteksi' }
{ type: 'hardware', passed: true,  message: 'RAM tersedia: 1024 MB' }

// Gagal
{ type: 'internet', passed: false, message: 'Koneksi internet tidak tersedia' }
{ type: 'camera',   passed: false, message: 'Kamera tidak terdeteksi atau tidak dapat diakses' }
{ type: 'hardware', passed: false, message: 'RAM tidak mencukupi: tersedia 256 MB, minimum 512 MB' }
```

### `ValidationSummary`

Objek yang dikirim ke renderer setelah semua pemeriksaan selesai (payload event `validation-result`).

```js
/**
 * @typedef {Object} ValidationSummary
 * @property {ValidationResult[]} results  - Array tiga hasil pemeriksaan
 * @property {boolean} allPassed           - true jika semua passed === true
 */
```

### Konstanta Aplikasi

```js
// src/constants.js
const CBT_URL = 'https://cbt.mtssupel.sch.id';
const CBT_DOMAIN = 'cbt.mtssupel.sch.id';
const INTERNET_CHECK_TIMEOUT_MS = 10_000;
const SERVER_LOAD_TIMEOUT_MS = 30_000;
const MIN_FREE_RAM_BYTES = 512 * 1024 * 1024; // 512 MB
const EXIT_SHORTCUT = 'Ctrl+Y+A';
```

---

## Properti Kebenaran

*Sebuah properti adalah karakteristik atau perilaku yang harus berlaku di semua eksekusi sistem yang valid — pada dasarnya, pernyataan formal tentang apa yang seharusnya dilakukan sistem. Properti berfungsi sebagai jembatan antara spesifikasi yang dapat dibaca manusia dan jaminan kebenaran yang dapat diverifikasi mesin.*

### Properti 1: Status HTTP menentukan hasil pemeriksaan internet

*Untuk setiap* respons HTTP dari CBT_URL, `checkInternet()` harus mengembalikan `passed === true` jika dan hanya jika kode status berada dalam rentang 200–399. Semua kode status di luar rentang tersebut, serta kondisi timeout dan error jaringan, harus menghasilkan `passed === false`.

**Validates: Requirements 2.1, 2.2, 2.3**

---

### Properti 2: Ambang batas RAM menentukan hasil pemeriksaan perangkat keras

*Untuk setiap* nilai yang dikembalikan oleh `os.freemem()`, `checkHardware()` harus mengembalikan `passed === true` jika dan hanya jika nilai tersebut ≥ 512 × 1024 × 1024 byte (512 MB). Properti ini harus berlaku untuk semua nilai yang mungkin termasuk nilai batas tepat 512 MB.

**Validates: Requirements 4.1, 4.2, 4.3**

---

### Properti 3: Ketersediaan perangkat kamera menentukan hasil pemeriksaan kamera

*Untuk setiap* daftar perangkat yang dikembalikan oleh enumerasi perangkat media, `checkCamera()` harus mengembalikan `passed === true` jika dan hanya jika daftar tersebut mengandung setidaknya satu perangkat kamera yang dapat diakses. Daftar kosong atau error akses harus menghasilkan `passed === false`.

**Validates: Requirements 3.2, 3.3, 3.4**

---

### Properti 4: `allPassed` konsisten dengan array `results`

*Untuk setiap* `ValidationSummary` yang dibangun dari array `ValidationResult`, nilai `allPassed` harus sama persis dengan `results.every(r => r.passed)`. Tidak boleh ada ketidakkonsistenan antara flag ringkasan dan isi array detail, untuk semua kombinasi nilai `passed` yang mungkin.

**Validates: Requirements 1.4, 5.1, 5.2**

---

### Properti 5: Guard navigasi memblokir semua URL di luar domain CBT

*Untuk setiap* URL yang dicoba dimuat oleh CBT_Window, fungsi `isAllowedUrl()` harus mengembalikan `true` jika dan hanya jika hostname URL tersebut adalah tepat `cbt.mtssupel.sch.id` atau berakhiran `.cbt.mtssupel.sch.id`. Semua URL lain — termasuk domain yang mirip, subdomain berbeda, atau protokol berbeda — harus diblokir.

**Validates: Requirements 6.4**

---

### Properti 6: Handler pembukaan jendela baru selalu menolak

*Untuk setiap* permintaan pembukaan jendela baru dari dalam CBT_Window (berapa pun URL-nya, apa pun disposisinya), `setWindowOpenHandler` harus mengembalikan `{ action: 'deny' }` tanpa pengecualian.

**Validates: Requirements 6.2**

---

### Properti 7: Handler izin kamera selalu memberikan izin

*Untuk setiap* permintaan izin media yang mengandung `'camera'` dari CBT_Window, `session.setPermissionRequestHandler` harus memanggil callback dengan `true` (izin diberikan) secara otomatis, tanpa memandang origin atau konteks permintaan.

**Validates: Requirements 3.5, 3.6**

---

### Properti 8: Serialisasi `ValidationResult` round-trip

*Untuk setiap* objek `ValidationResult` yang valid, serialisasi ke JSON dan deserialisasi kembali harus menghasilkan objek yang ekuivalen — semua field `type`, `passed`, dan `message` harus terjaga nilainya tanpa perubahan.

**Validates: Requirements 8.1, 8.3**

---

## Penanganan Error

### Error Validasi (Launcher_Window)

| Kondisi | Penanganan |
|---|---|
| `checkInternet()` timeout/gagal | `passed: false`, pesan "Koneksi internet tidak tersedia" |
| `checkCamera()` tidak ada perangkat | `passed: false`, pesan "Kamera tidak terdeteksi atau tidak dapat diakses" |
| `checkCamera()` akses ditolak OS | `passed: false`, pesan mencantumkan alasan penolakan |
| `checkHardware()` RAM < 512 MB | `passed: false`, pesan menyebutkan nilai aktual dan minimum |
| `Promise.all` salah satu reject | Tangkap error, tandai item terkait sebagai gagal dengan pesan generik |

### Error Pemuatan CBT_Window

Ditangani melalui event `did-fail-load` pada `webContents`:

```js
cbtWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
  const isTimeout = errorCode === -7; // ERR_TIMED_OUT
  const message = isTimeout
    ? 'Server ujian tidak merespons. Hubungi pengawas ujian.'
    : 'Gagal memuat halaman ujian. Periksa koneksi internet Anda.';
  
  // Inject halaman error HTML dengan tombol Coba Lagi
  cbtWindow.webContents.executeJavaScript(`
    document.open();
    document.write(${JSON.stringify(buildErrorPage(message))});
    document.close();
  `);
});
```

Halaman error yang diinjeksi mengekspos tombol "Coba Lagi" yang memanggil `window.electronAPI.retryLoad()` → `ipcMain` → `cbtWindow.loadURL(CBT_URL)`.

### Error IPC

- Semua handler `ipcMain.handle()` dibungkus dengan `try/catch`
- Error dikembalikan sebagai objek `{ error: true, message: string }` ke renderer
- Renderer menampilkan pesan error generik jika menerima respons error

---

## Strategi Pengujian

### Pendekatan Ganda: Unit Test + Property-Based Test

Pengujian menggunakan dua lapisan yang saling melengkapi:

1. **Unit test** — memverifikasi contoh spesifik, kasus tepi, dan kondisi error
2. **Property-based test** — memverifikasi properti universal di berbagai input yang digenerate secara acak

### Framework

- **Test runner**: [Jest](https://jestjs.io/) — standar ekosistem Node.js/Electron
- **Property-based testing**: [fast-check](https://fast-check.dev/) — library PBT untuk JavaScript/TypeScript
- **Mocking**: Jest built-in mocks untuk `os`, `net`, `electron`

Instalasi:
```bash
npm install --save-dev jest fast-check
```

### Unit Test

Fokus pada:
- Contoh konkret untuk setiap cabang logika di `validator.js`
- Kasus tepi: RAM tepat 512 MB, HTTP status 399 vs 400, timeout tepat 10 detik
- Integrasi IPC: handler `run-validation` dan `start-exam`
- Guard navigasi: URL valid dan invalid

Contoh:
```js
// validator.test.js
test('checkHardware lulus jika RAM tepat 512 MB', async () => {
  jest.spyOn(os, 'freemem').mockReturnValue(512 * 1024 * 1024);
  const result = await checkHardware();
  expect(result.passed).toBe(true);
});

test('checkInternet gagal jika HTTP status 400', async () => {
  // mock net.request mengembalikan status 400
  const result = await checkInternet();
  expect(result.passed).toBe(false);
});
```

### Property-Based Test

Setiap properti dari bagian Properti Kebenaran diimplementasikan sebagai satu property-based test dengan minimum **100 iterasi**.

Tag format: `// Feature: cbt-launcher, Property {N}: {teks properti}`

```js
// validator.property.test.js
const fc = require('fast-check');

// Feature: cbt-launcher, Property 1: Status HTTP menentukan hasil pemeriksaan internet
test('checkInternet: passed iff HTTP status 200-399', () => {
  fc.assert(
    fc.property(fc.integer({ min: 100, max: 599 }), (statusCode) => {
      const result = evaluateHttpStatus(statusCode); // pure logic extracted
      return result.passed === (statusCode >= 200 && statusCode <= 399);
    }),
    { numRuns: 100 }
  );
});

// Feature: cbt-launcher, Property 2: Ambang batas RAM menentukan hasil pemeriksaan perangkat keras
test('checkHardware: passed iff freemem >= 512MB', () => {
  fc.assert(
    fc.property(fc.nat({ max: 2 * 1024 * 1024 * 1024 }), (freeBytes) => {
      const result = evaluateRam(freeBytes); // pure logic extracted
      return result.passed === (freeBytes >= 512 * 1024 * 1024);
    }),
    { numRuns: 100 }
  );
});

// Feature: cbt-launcher, Property 3: Ketersediaan perangkat kamera menentukan hasil pemeriksaan kamera
test('checkCamera: passed iff device list non-empty', () => {
  const deviceArb = fc.record({ deviceId: fc.string(), label: fc.string() });
  fc.assert(
    fc.property(fc.array(deviceArb), (devices) => {
      const result = evaluateCameraDevices(devices); // pure logic extracted
      return result.passed === (devices.length > 0);
    }),
    { numRuns: 100 }
  );
});

// Feature: cbt-launcher, Property 4: allPassed konsisten dengan array results
test('ValidationSummary: allPassed === results.every(r => r.passed)', () => {
  const resultArb = fc.record({
    type: fc.constantFrom('internet', 'camera', 'hardware'),
    passed: fc.boolean(),
    message: fc.string(),
  });
  fc.assert(
    fc.property(fc.array(resultArb, { minLength: 3, maxLength: 3 }), (results) => {
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
        return true; // invalid URLs are not navigated to
      }
    }),
    { numRuns: 100 }
  );
});

// Feature: cbt-launcher, Property 6: Handler pembukaan jendela baru selalu menolak
test('windowOpenHandler: always returns deny for any URL', () => {
  fc.assert(
    fc.property(fc.webUrl(), (url) => {
      const result = windowOpenHandler({ url });
      return result.action === 'deny';
    }),
    { numRuns: 100 }
  );
});

// Feature: cbt-launcher, Property 7: Handler izin kamera selalu memberikan izin
test('permissionHandler: always grants camera permission', () => {
  const contextArb = fc.record({
    origin: fc.webUrl(),
    requestingUrl: fc.webUrl(),
  });
  fc.assert(
    fc.property(contextArb, (details) => {
      let granted = false;
      cameraPermissionHandler('media', (g) => { granted = g; }, details);
      return granted === true;
    }),
    { numRuns: 100 }
  );
});

// Feature: cbt-launcher, Property 8: Serialisasi ValidationResult round-trip
test('ValidationResult: JSON round-trip preserves all fields', () => {
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
```

### Catatan Pengujian Electron

- Logika murni (validator, URL guard, summary builder) diekstrak ke fungsi yang dapat diuji tanpa Electron
- Integrasi IPC diuji dengan mock `ipcMain`/`ipcRenderer`
- CBT_Window kiosk dan permission handler diuji dengan integration test manual atau Spectron/Playwright for Electron
- Property-based test tidak memerlukan Electron runtime — hanya menguji logika murni
