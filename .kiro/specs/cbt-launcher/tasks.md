# Rencana Implementasi: CBT Launcher

## Tasks

- [x] 1. Setup infrastruktur proyek dan dependensi pengujian
  - [x] 1.1 Instal Jest dan fast-check sebagai devDependencies
  - [x] 1.2 Tambahkan konfigurasi Jest di `package.json` (test script, testEnvironment: node)
  - [x] 1.3 Buat file `src/constants.js` yang mengekspor `CBT_URL`, `CBT_DOMAIN`, `INTERNET_CHECK_TIMEOUT_MS`, `SERVER_LOAD_TIMEOUT_MS`, `MIN_FREE_RAM_BYTES`, `EXIT_SHORTCUT`

- [x] 2. Implementasi modul Validator (`src/validator.js`)
  - [x] 2.1 Buat fungsi `checkInternet()` — HTTP GET ke `CBT_URL` dengan timeout 10 detik menggunakan `net.request` Electron atau `https` Node.js; kembalikan `ValidationResult`
  - [x] 2.2 Buat fungsi `checkCamera()` — enumerasi perangkat media menggunakan `desktopCapturer.getSources` atau `session` API; kembalikan `ValidationResult`
  - [x] 2.3 Buat fungsi `checkHardware()` — periksa `os.freemem() >= MIN_FREE_RAM_BYTES`; kembalikan `ValidationResult` dengan pesan yang menyebutkan nilai aktual
  - [x] 2.4 Buat fungsi `runAll()` — jalankan ketiga pemeriksaan secara paralel dengan `Promise.all`; kembalikan `ValidationSummary`
  - [x] 2.5 Ekstrak logika murni ke fungsi helper yang dapat diuji tanpa Electron: `evaluateHttpStatus(statusCode)`, `evaluateRam(freeBytes)`, `evaluateCameraDevices(devices)`, `buildSummary(results)`, `isAllowedUrl(url)`
  - [x] 2.6 Ekspor semua fungsi publik via `module.exports`

- [x] 3. Implementasi unit test untuk Validator
  - [x] 3.1 Tulis unit test untuk `evaluateHttpStatus`: status 200, 399 (batas atas lulus), 400 (batas bawah gagal), 500
  - [x] 3.2 Tulis unit test untuk `evaluateRam`: tepat 512 MB (lulus), 511 MB (gagal), 0 byte (gagal), 1 GB (lulus)
  - [x] 3.3 Tulis unit test untuk `evaluateCameraDevices`: daftar kosong (gagal), satu kamera (lulus), banyak kamera (lulus)
  - [x] 3.4 Tulis unit test untuk `buildSummary`: semua lulus, semua gagal, campuran
  - [x] 3.5 Tulis unit test untuk `isAllowedUrl`: domain tepat, subdomain valid, domain berbeda, URL malformed

- [x] 4. Implementasi property-based test untuk Validator
  - [x] 4.1 Tulis property test untuk Properti 1: `evaluateHttpStatus` — passed iff status 200–399 (100 iterasi)
  - [x] 4.2 Tulis property test untuk Properti 2: `evaluateRam` — passed iff freemem ≥ 512 MB (100 iterasi)
  - [x] 4.3 Tulis property test untuk Properti 3: `evaluateCameraDevices` — passed iff daftar non-kosong (100 iterasi)
  - [x] 4.4 Tulis property test untuk Properti 4: `buildSummary` — `allPassed === results.every(r => r.passed)` (100 iterasi)
  - [x] 4.5 Tulis property test untuk Properti 5: `isAllowedUrl` — izinkan iff hostname cocok dengan domain CBT (100 iterasi)
  - [x] 4.6 Tulis property test untuk Properti 6: `windowOpenHandler` — selalu mengembalikan `{ action: 'deny' }` (100 iterasi)
  - [x] 4.7 Tulis property test untuk Properti 7: `cameraPermissionHandler` — selalu memanggil callback dengan `true` untuk permintaan kamera (100 iterasi)
  - [x] 4.8 Tulis property test untuk Properti 8: `ValidationResult` JSON round-trip — semua field terjaga (100 iterasi)

- [x] 5. Implementasi Preload Bridge (`src/preload.js`)
  - [x] 5.1 Implementasi `contextBridge.exposeInMainWorld('electronAPI', {...})` dengan fungsi `runValidation`, `startExam`, `onValidationResult`, `onExamEnded`
  - [x] 5.2 Pastikan tidak ada objek Node.js atau modul Electron yang diekspos langsung (tidak ada `require`, `process`, dll.)
  - [x] 5.3 Gunakan `ipcRenderer.invoke` untuk `runValidation` dan `startExam`; gunakan `ipcRenderer.on` untuk listener event

- [x] 6. Implementasi Launcher_Window dan IPC handlers (`src/index.js`)
  - [x] 6.1 Refactor `createWindow()` menjadi `createLauncherWindow()` — buat `BrowserWindow` dengan `preload.js`, tanpa `nodeIntegration`, muat `index.html`
  - [x] 6.2 Implementasi handler `ipcMain.handle('run-validation')` — panggil `validator.runAll()`, kirim hasilnya kembali ke renderer
  - [x] 6.3 Implementasi handler `ipcMain.handle('start-exam')` — tutup `Launcher_Window`, panggil `createCbtWindow()`
  - [x] 6.4 Daftarkan global shortcut `Ctrl+Y+A` → `app.quit()` menggunakan `globalShortcut.register`
  - [x] 6.5 Unregister global shortcut saat `app.on('will-quit')`

- [x] 7. Implementasi CBT_Window (`src/index.js`)
  - [x] 7.1 Buat fungsi `createCbtWindow()` — buat `BrowserWindow` dengan `fullscreen: true`, `kiosk: true`, `webPreferences: { preload, nodeIntegration: false, contextIsolation: true }`
  - [x] 7.2 Pre-grant izin kamera menggunakan `cbtWindow.webContents.session.setPermissionRequestHandler` — izinkan `'media'` secara otomatis
  - [x] 7.3 Pasang guard navigasi: `webContents.on('will-navigate', ...)` — blokir URL di luar domain CBT menggunakan `isAllowedUrl()`
  - [x] 7.4 Pasang handler pembukaan jendela baru: `webContents.setWindowOpenHandler(() => ({ action: 'deny' }))`
  - [x] 7.5 Nonaktifkan menu konteks: `webContents.on('context-menu', e => e.preventDefault())`
  - [x] 7.6 Blokir keyboard berbahaya: `webContents.on('before-input-event', ...)` — blokir F11, F12, Ctrl+R, Ctrl+W, Alt+F4, Ctrl+Shift+I
  - [x] 7.7 Muat `CBT_URL` setelah semua guard terpasang

- [x] 8. Implementasi penanganan error CBT_Window
  - [x] 8.1 Buat fungsi `buildErrorPage(message)` di `src/index.js` — kembalikan string HTML halaman error dengan pesan dan tombol "Coba Lagi"
  - [x] 8.2 Pasang handler `webContents.on('did-fail-load', ...)` — deteksi `ERR_TIMED_OUT` (errorCode -7) vs error jaringan lain; inject halaman error yang sesuai menggunakan `executeJavaScript`
  - [x] 8.3 Implementasi handler `ipcMain.handle('retry-load')` — panggil `cbtWindow.loadURL(CBT_URL)`
  - [x] 8.4 Tambahkan `retryLoad` ke API yang diekspos di `preload.js`

- [x] 9. Implementasi Launcher UI (`src/index.html` + `src/renderer.js` + `src/index.css`)
  - [x] 9.1 Buat struktur HTML di `src/index.html` — tiga item validasi (`#check-internet`, `#check-camera`, `#check-hardware`), tombol Mulai (`#btn-start`), keterangan (`#validation-note`)
  - [x] 9.2 Buat `src/renderer.js` — panggil `window.electronAPI.runValidation()` saat halaman dimuat; tampilkan status "Memeriksa..." untuk setiap item
  - [x] 9.3 Implementasi handler `window.electronAPI.onValidationResult(callback)` — perbarui UI setiap item dengan status lulus/gagal dan pesan deskriptif
  - [x] 9.4 Aktifkan/nonaktifkan tombol Mulai berdasarkan `summary.allPassed`; tampilkan `#validation-note` jika ada yang gagal
  - [x] 9.5 Pasang event listener pada tombol Mulai — panggil `window.electronAPI.startExam()`
  - [x] 9.6 Tambahkan styling di `src/index.css` — indikator status (warna hijau/merah/abu-abu), layout validasi, tombol Mulai aktif/nonaktif

- [x] 10. Verifikasi akhir dan integrasi
  - [x] 10.1 Jalankan semua unit test dan property-based test (`npm test`) — pastikan semua lulus
  - [x] 10.2 Jalankan aplikasi dengan `npm start` — verifikasi alur lengkap: validasi → tombol Mulai → CBT_Window kiosk
  - [x] 10.3 Verifikasi global shortcut Ctrl+Y+A menutup aplikasi dari CBT_Window
  - [x] 10.4 Verifikasi halaman error muncul dan tombol "Coba Lagi" berfungsi saat CBT_URL tidak dapat dimuat
  - [x] 10.5 Verifikasi navigasi ke URL luar domain diblokir di CBT_Window
