'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Validasi perangkat
  runValidation: () => ipcRenderer.invoke('run-validation'),

  // Enumerasi kamera — renderer memanggil navigator.mediaDevices lalu
  // mengirim hasilnya ke sini; fungsi ini mengembalikan Promise<Device[]>
  getCameras: () => ipcRenderer.invoke('get-cameras'),

  // Mulai ujian, kirim deviceId kamera yang dipilih
  startExam: (selectedCameraDeviceId) =>
    ipcRenderer.invoke('start-exam', selectedCameraDeviceId),

  // Listener hasil validasi (push event)
  onValidationResult: (callback) =>
    ipcRenderer.on('validation-result', (_e, result) => callback(result)),

  // Listener notifikasi sesi ujian berakhir
  onExamEnded: (callback) =>
    ipcRenderer.on('exam-ended', () => callback()),

  // Muat ulang CBT_URL dari halaman error
  retryLoad: () => ipcRenderer.invoke('retry-load'),

  // Auto-update
  onUpdateStatus: (callback) =>
    ipcRenderer.on('update-status', (_e, info) => callback(info)),
  installUpdate: () => ipcRenderer.invoke('install-update'),
});
