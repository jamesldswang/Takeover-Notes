const { ipcRenderer, contextBridge } = require('electron');

window.addEventListener('DOMContentLoaded', () => {
  // 左上角紅綠燈旁顯示版號
  const ver = document.createElement('span');
  ver.className = 'app-version';
  ver.textContent = 'v' + ipcRenderer.sendSync('get-version');
  document.querySelector('.window-controls')?.appendChild(ver);

  // 紅點 / 黃點 = 隱藏視窗
  document.querySelector('.dot-close')?.addEventListener('click', () => ipcRenderer.send('win', 'hide'));
  document.querySelector('.dot-min')?.addEventListener('click', () => ipcRenderer.send('win', 'hide'));
});

// notes.html 透過 window.__notesApp 存取資料；資料由 main.js 統一保管、寫檔
contextBridge.exposeInMainWorld('__notesApp', {
  list: () => ipcRenderer.sendSync('list'),
  add: (fields) => ipcRenderer.sendSync('add', fields),
  update: (id, patch) => ipcRenderer.send('update', id, patch),
  complete: (id) => ipcRenderer.send('complete', id),
  remove: (id) => ipcRenderer.send('remove', id),
  openFolder: (id) => ipcRenderer.send('open-folder', id),
  onChange: (cb) => ipcRenderer.on('data-changed', (_e, projects) => cb(projects)),
  onReminder: (cb) => ipcRenderer.on('reminder', (_e, r) => cb(r)),
  onReminderCancel: (cb) => ipcRenderer.on('reminder-cancel', (_e, reqId) => cb(reqId)),
  answerReminder: (reqId, action) => ipcRenderer.send('reminder-answer', reqId, action),
  launchClaude: (id, cont) => ipcRenderer.invoke('launch-claude', id, !!cont), // 回傳 { ok, error? }
  setMode: (m) => ipcRenderer.send('set-mode', m),   // 'launcher' | 'full'，視窗會跟著改大小
  onMode: (cb) => ipcRenderer.on('mode', (_e, m) => cb(m)),
  hide: () => ipcRenderer.send('win', 'hide'),
  show: () => ipcRenderer.send('win', 'show'),
  pin: () => ipcRenderer.send('win', 'pin'),
  unpin: () => ipcRenderer.send('win', 'unpin'),
});
