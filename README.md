# yamicbtdesktop

Aplikasi desktop peluncur ujian berbasis komputer (CBT) untuk MTs Supel, dibangun dengan Electron.

---

## Deskripsi

**yamicbtdesktop** adalah launcher kiosk yang memastikan perangkat peserta ujian memenuhi syarat sebelum membuka sesi ujian. Aplikasi menjalankan validasi otomatis (internet, kamera, RAM), lalu membuka URL CBT dalam mode fullscreen terkunci sehingga peserta tidak dapat mengakses aplikasi lain selama ujian berlangsung.

---

## Fitur

- Validasi otomatis: koneksi internet, kamera, dan RAM minimum
- **Pemilihan kamera** — jika ada ≥2 kamera, dropdown muncul untuk memilih kamera yang digunakan
- **Auto-update** — cek pembaruan dari GitHub Releases saat app dibuka, notifikasi banner + tombol pasang
- Mode kiosk fullscreen — tidak bisa di-minimize, resize, atau ditutup secara normal
- Blokir keyboard berbahaya (F11, F12, Ctrl+R, Ctrl+W, Alt+F4, Ctrl+Shift+I)
- Blokir navigasi ke URL di luar domain CBT
- Blokir pembukaan jendela/tab baru
- Nonaktifkan menu konteks klik kanan
- Pre-grant izin kamera otomatis (tanpa dialog konfirmasi)
- Halaman error dengan tombol "Coba Lagi" jika server tidak dapat dimuat
- Suppression Win key via Windows API saat sesi ujian aktif

---

## Persyaratan Sistem

| Komponen | Minimum |
|---|---|
| OS | Windows 10/11, macOS 10.15+, Ubuntu 18.04+ |
| RAM | 512 MB (total terpasang) |
| Kamera | Minimal 1 perangkat kamera terhubung |
| Internet | Koneksi aktif ke `https://cbt.mtssupel.sch.id` |
| Node.js | 18+ (untuk development) |

---

## Instalasi & Development

```bash
# Clone repo
git clone <repo-url>
cd yamicbtdesktop

# Install dependencies
npm install

# Jalankan dalam mode development
npm start
```

---

## Perintah

| Perintah | Fungsi |
|---|---|
| `npm start` | Jalankan aplikasi dalam mode development |
| `npm test` | Jalankan semua unit test dan property-based test |
| `npm run package` | Package aplikasi ke folder `out/` |
| `npm run make` | Build installer untuk platform saat ini |
| `npm run publish` | Publish ke target yang dikonfigurasi |

---

## Shortcut Keyboard

### Saat Launcher (layar validasi)

Tidak ada shortcut khusus. Tombol **Mulai Ujian** hanya aktif jika semua validasi lulus.

### Saat Sesi Ujian (CBT_Window aktif)

| Shortcut | Fungsi |
|---|---|
| **Ctrl+Shift+Q** | Keluar dari aplikasi (menutup seluruh sesi ujian) |

> **Catatan penting:** Shortcut keluar hanya boleh digunakan oleh pengawas ujian. Berikan kombinasi ini hanya kepada pengawas.

### Keyboard yang diblokir selama sesi ujian

| Key / Kombinasi | Yang diblokir |
|---|---|
| F11 | Toggle fullscreen browser |
| F12 | DevTools |
| Ctrl+R | Reload halaman |
| Ctrl+W | Tutup tab |
| Alt+F4 | Tutup jendela |
| Ctrl+Shift+I | DevTools (alternatif) |
| Super+D | Show Desktop |
| Super+E | File Explorer |
| Super+L | Lock Screen |
| Super+R | Run dialog |
| Super+Tab | Task View |
| Super+A | Action Center |
| Super+S | Search |
| Super+I | Settings |
| Super+X | Quick Link menu |
| Alt+Escape | Window cycling |
| Ctrl+Escape | Start Menu (alternatif) |
| Win key | Start Menu — diblokir via Windows API (`SystemParametersInfo`) |

> **Tidak bisa diblokir:** `Ctrl+Alt+Delete` — ini reserved di level kernel Windows dan tidak dapat dicegat oleh aplikasi manapun.

---

## Alur Aplikasi

```
Buka aplikasi
    │
    ▼
Launcher_Window — validasi otomatis (paralel)
    ├── Cek internet  → HTTP GET ke CBT_URL, timeout 10 detik
    ├── Cek kamera    → enumerasi via desktopCapturer
    └── Cek RAM       → os.totalmem() ≥ 512 MB
    │
    ▼ (semua lulus → tombol Mulai aktif)
Pengguna klik Mulai
    │
    ▼
Launcher_Window ditutup
CBT_Window dibuka (fullscreen + kiosk)
    ├── Win key disuppress via Windows API
    ├── Semua guard keyboard aktif
    └── Muat https://cbt.mtssupel.sch.id
    │
    ├── Sukses → sesi ujian aktif
    └── Gagal  → halaman error + tombol "Coba Lagi"
    │
    ▼ (Ctrl+Shift+Q)
app.quit() — semua shortcut di-restore, Win key di-restore
```

---

## Struktur Proyek

```
yamicbtdesktop/
├── src/
│   ├── index.js                  # Main process — window management, IPC, shortcuts
│   ├── validator.js              # Modul validasi perangkat (internet, kamera, RAM)
│   ├── constants.js              # Konstanta aplikasi (URL, timeout, threshold)
│   ├── preload.js                # contextBridge API bridge (main ↔ renderer)
│   ├── index.html                # Launcher UI
│   ├── renderer.js               # Logika renderer untuk UI validasi
│   ├── index.css                 # Styling (dark theme minimalis)
│   ├── validator.test.js         # Unit tests (Jest)
│   └── validator.property.test.js # Property-based tests (fast-check)
├── forge.config.js               # Electron Forge config (makers, fuses)
├── package.json
└── README.md
```

---

## Konstanta Penting (`src/constants.js`)

| Konstanta | Nilai | Keterangan |
|---|---|---|
| `CBT_URL` | `https://cbt.mtssupel.sch.id` | URL tujuan ujian |
| `CBT_DOMAIN` | `cbt.mtssupel.sch.id` | Domain yang diizinkan untuk navigasi |
| `INTERNET_CHECK_TIMEOUT_MS` | `10000` | Timeout cek internet (10 detik) |
| `SERVER_LOAD_TIMEOUT_MS` | `30000` | Timeout load server CBT (30 detik) |
| `MIN_FREE_RAM_BYTES` | `536870912` | Minimum RAM = 512 MB |
| `EXIT_SHORTCUT` | `Ctrl+Shift+Q` | Shortcut keluar untuk pengawas |

---

## Pengujian

Proyek menggunakan dua lapisan pengujian:

### Unit Test (`src/validator.test.js`)
Memverifikasi contoh konkret untuk setiap fungsi pure di `validator.js`:
- `evaluateHttpStatus` — status 200, 399, 400, 500
- `evaluateRam` — tepat 512 MB, 511 MB, 0 byte, 1 GB
- `evaluateCameraDevices` — daftar kosong, satu kamera, banyak kamera
- `buildSummary` — semua lulus, semua gagal, campuran
- `isAllowedUrl` — domain tepat, subdomain, domain lain, URL malformed

### Property-Based Test (`src/validator.property.test.js`)
Memverifikasi properti universal dengan 100 iterasi random per properti menggunakan [fast-check](https://fast-check.dev/):

| # | Properti |
|---|---|
| 1 | `evaluateHttpStatus` — passed iff status 200–399 |
| 2 | `evaluateRam` — passed iff freemem ≥ 512 MB |
| 3 | `evaluateCameraDevices` — passed iff daftar non-kosong |
| 4 | `buildSummary` — `allPassed === results.every(r => r.passed)` |
| 5 | `isAllowedUrl` — izinkan iff hostname cocok domain CBT |
| 6 | `windowOpenHandler` — selalu `{ action: 'deny' }` |
| 7 | `cameraPermissionHandler` — selalu callback `true` untuk `'media'` |
| 8 | `ValidationResult` JSON round-trip — semua field terjaga |

```bash
npm test
# Expected: 27 tests passed (2 suites)
```

---

## Security (Electron Fuses)

Dikonfigurasi di `forge.config.js` saat packaging:

| Fuse | Status |
|---|---|
| RunAsNode | Disabled |
| EnableCookieEncryption | Enabled |
| EnableNodeOptionsEnvironmentVariable | Disabled |
| EnableNodeCliInspectArguments | Disabled |
| EnableEmbeddedAsarIntegrityValidation | Enabled |
| OnlyLoadAppFromAsar | Enabled |

---

## Auto-Update

Aplikasi menggunakan [`update-electron-app`](https://github.com/electron/update-electron-app) yang terhubung ke GitHub Releases secara otomatis.

**Cara kerja:**
1. Saat app dibuka (dalam mode packaged), app cek GitHub Releases setiap 1 jam
2. Jika ada versi baru, banner muncul di atas launcher: *"Pembaruan tersedia, sedang mengunduh..."*
3. Setelah download selesai, banner berubah: *"Pembaruan siap dipasang"* + tombol **Pasang & Restart**
4. Klik tombol → app restart otomatis dengan versi baru

**Cara merilis update (otomatis via GitHub Actions):**
```bash
# 1. Naikkan versi — otomatis buat commit + tag
npm version patch   # 1.0.0 → 1.0.1  (bugfix)
npm version minor   # 1.0.0 → 1.1.0  (fitur baru)
npm version major   # 1.0.0 → 2.0.0  (breaking change)

# 2. Push commit + tag ke GitHub
git push && git push --tags
```

Setelah push tag, GitHub Actions akan otomatis:
1. Checkout kode
2. Install dependencies
3. Jalankan semua tests — jika gagal, release dibatalkan
4. Build installer Windows (`.exe`, `.nupkg`, `RELEASES`)
5. Buat GitHub Release dan upload semua file installer

Kamu bisa pantau prosesnya di tab **Actions** di repository GitHub.

> Auto-update hanya aktif di app yang sudah di-package. Saat development (`npm start`), fitur ini dinonaktifkan otomatis.

**Repository:** https://github.com/manaim2112/YamiCbtDesktop (harus public)

---



```bash
# Package (tanpa installer)
npm run package
# Output: out/yamicbtdesktop-win32-x64/

# Build installer
npm run make
# Output: out/make/
#   Windows: Squirrel installer (.exe)
#   macOS:   ZIP
#   Linux:   .deb + .rpm
```

---

## Lisensi

MIT — © manaim2112
