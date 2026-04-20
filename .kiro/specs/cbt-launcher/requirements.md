# Dokumen Requirements

## Pendahuluan

Fitur **CBT Launcher** adalah antarmuka peluncur ujian berbasis komputer (Computer-Based Test) untuk aplikasi **yamicbtdesktop**. Sebelum membuka sesi ujian, aplikasi menjalankan validasi perangkat secara otomatis — memeriksa koneksi internet, ketersediaan kamera, dan kelayakan perangkat keras. Jika semua pemeriksaan lulus, pengguna menekan tombol **Mulai** untuk membuka URL CBT (`https://cbt.mtssupel.sch.id`) dalam jendela penuh layar (*fullscreen*) yang terkunci. Selama sesi ujian berlangsung, pengguna tidak dapat membuka aplikasi atau jendela lain, kecuali menggunakan pintasan keyboard **Ctrl+Y+A** untuk mengakhiri atau membuka kunci sesi.

---

## Glosarium

- **Launcher**: Layar awal aplikasi yang menampilkan hasil validasi perangkat dan tombol Mulai.
- **Validator**: Modul proses utama (*main process*) yang menjalankan pemeriksaan perangkat, internet, dan kamera.
- **CBT_Window**: Jendela `BrowserWindow` Electron yang memuat URL CBT dalam mode *fullscreen* terkunci.
- **Launcher_Window**: Jendela `BrowserWindow` Electron yang menampilkan layar validasi dan tombol Mulai.
- **Renderer**: Proses renderer Electron yang menampilkan antarmuka pengguna.
- **Preload_Bridge**: Skrip preload (`preload.js`) yang mengekspos API aman ke Renderer melalui `contextBridge`.
- **CBT_URL**: URL tujuan ujian, yaitu `https://cbt.mtssupel.sch.id`.
- **Sesi_Ujian**: Periode aktif saat CBT_Window sedang terbuka dan terkunci penuh. Sesi berakhir ketika aplikasi ditutup sepenuhnya.
- **Pintasan_Keluar**: Kombinasi tombol keyboard **Ctrl+Y+A** yang memanggil `app.quit()` untuk menutup seluruh aplikasi.

---

## Requirements

### Requirement 1: Validasi Perangkat Otomatis

**User Story:** Sebagai peserta ujian, saya ingin aplikasi memeriksa kesiapan perangkat saya secara otomatis, sehingga saya tahu apakah perangkat saya memenuhi syarat sebelum memulai ujian.

#### Acceptance Criteria

1. WHEN aplikasi diluncurkan, THE Launcher_Window SHALL menampilkan layar validasi perangkat sebelum konten lain ditampilkan.
2. WHEN layar validasi ditampilkan, THE Validator SHALL menjalankan pemeriksaan koneksi internet, ketersediaan kamera, dan kelayakan perangkat keras secara bersamaan.
3. WHEN pemeriksaan sedang berjalan, THE Renderer SHALL menampilkan indikator status "Memeriksa..." untuk setiap item pemeriksaan.
4. WHEN semua pemeriksaan selesai, THE Renderer SHALL menampilkan hasil setiap pemeriksaan dengan status lulus atau gagal beserta pesan deskriptif.
5. IF pemeriksaan koneksi internet gagal, THEN THE Renderer SHALL menampilkan pesan "Koneksi internet tidak tersedia" pada item pemeriksaan internet.
6. IF pemeriksaan kamera gagal, THEN THE Renderer SHALL menampilkan pesan "Kamera tidak terdeteksi atau tidak dapat diakses" pada item pemeriksaan kamera.
7. IF pemeriksaan perangkat keras gagal, THEN THE Renderer SHALL menampilkan pesan deskriptif yang menjelaskan komponen yang tidak memenuhi syarat.

---

### Requirement 2: Pemeriksaan Koneksi Internet

**User Story:** Sebagai peserta ujian, saya ingin aplikasi memverifikasi koneksi internet saya, sehingga saya yakin dapat mengakses server CBT.

#### Acceptance Criteria

1. WHEN Validator menjalankan pemeriksaan internet, THE Validator SHALL mencoba melakukan permintaan HTTP ke CBT_URL dengan batas waktu 10 detik.
2. WHEN permintaan HTTP ke CBT_URL berhasil mendapat respons dengan kode status 200–399, THE Validator SHALL menandai pemeriksaan internet sebagai lulus.
3. IF permintaan HTTP ke CBT_URL gagal atau melampaui batas waktu 10 detik, THEN THE Validator SHALL menandai pemeriksaan internet sebagai gagal.
4. WHEN pemeriksaan internet selesai, THE Validator SHALL mengirimkan hasil pemeriksaan ke Renderer melalui Preload_Bridge.

---

### Requirement 3: Pemeriksaan Ketersediaan Kamera dan Izin Otomatis

**User Story:** Sebagai peserta ujian, saya ingin aplikasi memverifikasi bahwa kamera saya tersedia dan langsung dapat digunakan tanpa konfirmasi tambahan, sehingga pengawas ujian dapat memantau saya selama ujian berlangsung tanpa hambatan.

#### Acceptance Criteria

1. WHEN Validator menjalankan pemeriksaan kamera, THE Validator SHALL mendeteksi perangkat kamera yang terhubung ke sistem.
2. WHEN setidaknya satu perangkat kamera terdeteksi dan dapat diakses, THE Validator SHALL menandai pemeriksaan kamera sebagai lulus.
3. IF tidak ada perangkat kamera yang terdeteksi, THEN THE Validator SHALL menandai pemeriksaan kamera sebagai gagal.
4. IF akses ke perangkat kamera ditolak oleh sistem operasi, THEN THE Validator SHALL menandai pemeriksaan kamera sebagai gagal dan mencatat alasan penolakan.
5. WHEN CBT_Window dibuka, THE CBT_Window SHALL memiliki izin kamera yang telah diberikan sebelumnya (*pre-granted*) sehingga tidak ada dialog konfirmasi izin dari browser atau sistem operasi yang ditampilkan kepada pengguna.
6. WHEN halaman CBT meminta akses kamera melalui API browser, THE CBT_Window SHALL mengizinkan permintaan tersebut secara otomatis tanpa interaksi pengguna.

---

### Requirement 4: Pemeriksaan Kelayakan Perangkat Keras

**User Story:** Sebagai peserta ujian, saya ingin aplikasi memverifikasi bahwa perangkat keras saya memenuhi spesifikasi minimum, sehingga ujian dapat berjalan dengan lancar.

#### Acceptance Criteria

1. WHEN Validator menjalankan pemeriksaan perangkat keras, THE Validator SHALL memeriksa bahwa memori RAM yang tersedia tidak kurang dari 512 MB.
2. WHEN semua komponen perangkat keras memenuhi spesifikasi minimum, THE Validator SHALL menandai pemeriksaan perangkat keras sebagai lulus.
3. IF memori RAM yang tersedia kurang dari 512 MB, THEN THE Validator SHALL menandai pemeriksaan perangkat keras sebagai gagal.

---

### Requirement 5: Tombol Mulai dan Pembukaan Sesi Ujian

**User Story:** Sebagai peserta ujian, saya ingin menekan tombol Mulai setelah semua pemeriksaan lulus, sehingga saya dapat langsung memulai ujian.

#### Acceptance Criteria

1. WHILE semua pemeriksaan validasi menunjukkan status lulus, THE Renderer SHALL mengaktifkan tombol Mulai.
2. WHILE setidaknya satu pemeriksaan validasi menunjukkan status gagal, THE Renderer SHALL menonaktifkan tombol Mulai dan menampilkan keterangan bahwa persyaratan belum terpenuhi.
3. WHEN pengguna menekan tombol Mulai, THE Launcher_Window SHALL menutup dirinya sendiri dan membuka CBT_Window.
4. WHEN CBT_Window dibuka, THE CBT_Window SHALL memuat CBT_URL dalam mode *fullscreen* penuh.
5. WHEN CBT_Window selesai memuat CBT_URL, THE CBT_Window SHALL memasuki mode kiosk sehingga pengguna tidak dapat mengubah ukuran, meminimalkan, atau menutup jendela secara normal.

---

### Requirement 6: Mode Kiosk dan Pembatasan Akses Selama Sesi Ujian

**User Story:** Sebagai penyelenggara ujian, saya ingin jendela ujian terkunci penuh layar, sehingga peserta tidak dapat mengakses aplikasi atau konten lain selama ujian berlangsung.

#### Acceptance Criteria

1. WHILE Sesi_Ujian berlangsung, THE CBT_Window SHALL memblokir semua pintasan keyboard bawaan Electron yang dapat membuka DevTools, menavigasi halaman, atau keluar dari *fullscreen* (termasuk F11, F12, Ctrl+R, Ctrl+W, Alt+F4).
2. WHILE Sesi_Ujian berlangsung, THE CBT_Window SHALL mencegah pengguna membuka jendela baru atau tab baru dari dalam halaman CBT.
3. WHILE Sesi_Ujian berlangsung, THE CBT_Window SHALL menonaktifkan menu konteks klik kanan.
4. WHILE Sesi_Ujian berlangsung, THE CBT_Window SHALL memblokir navigasi ke URL selain domain `cbt.mtssupel.sch.id` dan subdomain-nya (misalnya `*.cbt.mtssupel.sch.id`).
5. IF pengguna menekan kombinasi Pintasan_Keluar (Ctrl+Y+A), THEN THE CBT_Window SHALL memanggil `app.quit()` untuk menutup seluruh aplikasi.

---

### Requirement 7: Penanganan Kesalahan Saat Memuat CBT_URL

**User Story:** Sebagai peserta ujian, saya ingin mendapat informasi yang jelas jika halaman ujian gagal dimuat, sehingga saya dapat melaporkan masalah kepada pengawas.

#### Acceptance Criteria

1. IF CBT_Window gagal memuat CBT_URL karena kesalahan jaringan, THEN THE CBT_Window SHALL menampilkan halaman kesalahan dengan pesan "Gagal memuat halaman ujian. Periksa koneksi internet Anda." beserta tombol Coba Lagi.
2. IF CBT_Window gagal memuat CBT_URL karena server tidak merespons dalam 30 detik, THEN THE CBT_Window SHALL menampilkan halaman kesalahan dengan pesan "Server ujian tidak merespons. Hubungi pengawas ujian."
3. WHEN pengguna menekan tombol Coba Lagi pada halaman kesalahan, THE CBT_Window SHALL mencoba memuat ulang CBT_URL.
4. IF pengguna menekan Pintasan_Keluar dari halaman kesalahan, THEN THE CBT_Window SHALL memanggil `app.quit()` untuk menutup seluruh aplikasi.

---

### Requirement 8: Komunikasi IPC Melalui Preload Bridge

**User Story:** Sebagai pengembang, saya ingin semua komunikasi antara proses utama dan renderer dilakukan melalui contextBridge, sehingga keamanan aplikasi tetap terjaga tanpa mengaktifkan nodeIntegration.

#### Acceptance Criteria

1. THE Preload_Bridge SHALL mengekspos fungsi `runValidation` ke Renderer untuk memicu pemeriksaan validasi perangkat di proses utama.
2. THE Preload_Bridge SHALL mengekspos fungsi `startExam` ke Renderer untuk memicu pembukaan CBT_Window dari proses utama.
3. THE Preload_Bridge SHALL mengekspos fungsi `onValidationResult` ke Renderer untuk menerima hasil pemeriksaan validasi secara asinkron dari proses utama.
4. THE Preload_Bridge SHALL mengekspos fungsi `onExamEnded` ke Renderer untuk menerima notifikasi ketika Sesi_Ujian berakhir.
5. THE Preload_Bridge SHALL TIDAK mengekspos objek Node.js atau modul internal Electron secara langsung ke Renderer.
