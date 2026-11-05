const { app, BrowserWindow, globalShortcut, Tray, Menu, nativeImage, ipcMain, screen, shell, clipboard } = require('electron');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const store = require('./store');

const HOTKEY = 'Control+Alt+N'; // Fn 鍵 Windows 偵測不到，所以用 Ctrl+Alt+N
const PORT = Number(process.env.PROJECT_NOTES_PORT) || 47321; // hook.js / cli.js 用這個 port 跟 App 溝通
// 兩種模式：launcher = 快速切換（Ctrl+Alt+N 一叫出來就是這個），full = 完整筆記
// 尺寸要和 notes.html 的 .window／.window.launcher 一致
const SIZES = { launcher: [600, 440], full: [760, 580] };
const REMINDER_TIMEOUT_MS = 90 * 1000; // 提醒視窗沒人回應就當成「稍後」（hook 的 timeout 是 120 秒）

let win, tray, pinned = false, mode = 'launcher';

if (!app.requestSingleInstanceLock()) { app.quit(); }
app.on('second-instance', () => showWin('launcher'));

const APP_CSS = `
  html, body { background: transparent !important; }
  body { padding: 0 !important; min-height: 100vh; overflow: hidden; }
  .window { border-radius: 16px; }
  .header { -webkit-app-region: drag; }
  .dot, button, input, textarea, select, label, .header-actions { -webkit-app-region: no-drag; }
  .dot { cursor: pointer; }
  .window-controls { align-items: center; }
  .app-version { margin-left: 10px; font-size: 11px; color: #636366; letter-spacing: 0.3px; }
`;

// ---------- 資料 ----------
const dataFile = () => path.join(app.getPath('userData'), 'notes.json');
let data = { projects: [] };
let saveTimer = null;

function loadData() {
  try { data = store.normalize(JSON.parse(fs.readFileSync(dataFile(), 'utf8'))); }
  catch { data = { projects: [] }; }
}

function saveNow() {
  clearTimeout(saveTimer); saveTimer = null;
  try {
    fs.mkdirSync(path.dirname(dataFile()), { recursive: true });
    const tmp = dataFile() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, dataFile()); // 先寫暫存檔再改名，寫到一半當掉也不會弄壞原檔
  } catch (e) { console.error('儲存失敗：', e); }
}

// 資料有變：稍後寫檔，並通知畫面重畫
function changed() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 300);
  if (win && !win.isDestroyed()) win.webContents.send('data-changed', data.projects);
}

// ---------- 視窗 ----------
function createWindow() {
  win = new BrowserWindow({
    width: SIZES.launcher[0], height: SIZES.launcher[1],
    frame: false, transparent: true, resizable: false,
    show: false, skipTaskbar: true, alwaysOnTop: true,
    icon: trayIcon(),
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  win.loadFile(path.join(__dirname, 'notes.html'));
  win.webContents.on('did-finish-load', () => {
    win.webContents.insertCSS(APP_CSS);
    flushReminders(); // App 剛啟動時就有 hook 在等的話，等頁面好了再送
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.on('blur', () => { if (!pinned && !win.webContents.isDevToolsOpened()) win.hide(); });
  win.on('close', (e) => { if (!app.isQuitting) { e.preventDefault(); win.hide(); } });
}

// 不傳 newMode 就維持目前的模式
function showWin(newMode) {
  if (!win) return;
  if (newMode) mode = newMode;
  const [w, h] = SIZES[mode];
  const { x, y, width, height } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  win.setBounds({ x: Math.round(x + (width - w) / 2), y: Math.round(y + (height - h) / 2), width: w, height: h });
  win.webContents.send('mode', mode);
  win.show();
  win.focus();
}

function toggleWin() { win.isVisible() && win.isFocused() ? win.hide() : showWin('launcher'); }

// ---------- 開啟 Claude Code ----------
function claudeExe() {
  const p = path.join(os.homedir(), '.local', 'bin', 'claude.exe');
  return fs.existsSync(p) ? p : 'claude'; // 找不到就交給 PATH
}

const launches = []; // 測試用：記下要開的資料夾，不真的開
// 用 cmd 的 start 開一個新的主控台視窗，在專案資料夾執行 claude（--continue = 接續上次的對話）
function launchClaude(p, cont) {
  if (!fs.existsSync(p.path)) return { ok: false, error: `找不到資料夾：${p.path}` };
  store.touch(data, p.path);
  changed();
  if (process.env.PROJECT_NOTES_TEST) { launches.push({ path: p.path, cont: !!cont }); return { ok: true }; }
  const title = ('Claude Code - ' + p.name).replace(/["^&|<>%]/g, '');
  const cmd = `/d /c start "${title}" /D "${p.path}" "${claudeExe()}"${cont ? ' --continue' : ''}`;
  spawn('cmd.exe', [cmd], { detached: true, stdio: 'ignore', windowsVerbatimArguments: true, windowsHide: true }).unref();
  win.hide();
  return { ok: true };
}

// ---------- 開啟專案時的提醒 ----------
// hook.js 送來 /session-start 後，HTTP 回應會等到使用者在畫面上按下按鈕才送出。
const pendingReminders = new Map(); // reqId -> { projectId, resolve, timer, sent }
let reminderSeq = 0;

function askReminder(project) {
  return new Promise((resolve) => {
    const reqId = String(++reminderSeq);
    const timer = setTimeout(() => finishReminder(reqId, 'timeout'), REMINDER_TIMEOUT_MS);
    pendingReminders.set(reqId, { projectId: project.id, resolve, timer, sent: false });
    pinned = true;
    showWin('full');
    flushReminders();
  });
}

function flushReminders() {
  if (!win || win.webContents.isLoading()) return;
  for (const [reqId, r] of pendingReminders) {
    if (r.sent) continue;
    r.sent = true;
    win.webContents.send('reminder', { reqId, projectId: r.projectId });
  }
}

function finishReminder(reqId, action) {
  const r = pendingReminders.get(reqId);
  if (!r) return;
  clearTimeout(r.timer);
  pendingReminders.delete(reqId);
  if (action === 'timeout' && win) win.webContents.send('reminder-cancel', reqId);
  const p = data.projects.find((x) => x.id === r.projectId);
  if (action === 'run' && p && p.next && !process.env.PROJECT_NOTES_TEST) clipboard.writeText(`開始執行下一步：${p.next}`);
  if (pendingReminders.size === 0) pinned = false;
  r.resolve({ action, project: p || null });
}

// ---------- 本機 HTTP（給 hook.js / cli.js 用）----------
function readBody(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { s += c; if (s.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function startServer() {
  const server = http.createServer(async (req, res) => {
    const reply = (code, obj) => {
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(obj));
    };
    // 瀏覽器發的請求一定帶 Origin；一律拒絕，避免網頁偷改筆記
    if (req.headers.origin) return reply(403, { error: 'forbidden' });
    try {
      if (req.method === 'GET' && req.url === '/ping') return reply(200, { ok: true, app: 'project-notes' });
      if (req.method !== 'POST') return reply(404, { error: 'not found' });
      const body = await readBody(req);

      if (req.url === '/session-start') {
        if (!body.cwd) return reply(400, { error: 'cwd 必填' });
        const p = store.touch(data, body.cwd);
        changed();
        const wantsReminder = p.remind && p.next.trim() && ['startup', 'resume', undefined].includes(body.source);
        if (!wantsReminder) return reply(200, { action: 'none', project: p });
        return reply(200, await askReminder(p));
      }

      if (req.url === '/get') {
        const p = store.findByPath(data, body.cwd || '');
        return reply(200, { project: p || null });
      }

      if (req.url === '/update') {
        if (!body.cwd) return reply(400, { error: 'cwd 必填' });
        const p = store.findByPath(data, body.cwd) || store.touch(data, body.cwd, { open: false });
        if (body.done) store.completeNext(p);
        const patch = {};
        for (const k of ['progress', 'next', 'name']) if (typeof body[k] === 'string') patch[k] = body[k];
        store.update(data, p.id, patch);
        changed();
        return reply(200, { project: p });
      }

      return reply(404, { error: 'not found' });
    } catch (e) {
      return reply(500, { error: String(e && e.message || e) });
    }
  });
  server.on('error', (e) => console.error(`HTTP port ${PORT} 無法使用：`, e.message));
  server.listen(PORT, '127.0.0.1');
}

// ---------- 圖示 ----------
// Windows 的 nativeImage 不支援 SVG（會變成空白灰框），所以直接畫成點陣圖。
// 設計座標是 32x32：黃色圓角便條紙、上方深色裝訂條、三條橫線。
function drawIconBitmap(size) {
  const k = size / 32, SS = 4; // 每個像素取 4x4 個樣本做反鋸齒
  const buf = Buffer.alloc(size * size * 4);
  const inRoundRect = (px, py, x0, y0, x1, y1, r) => {
    const cx = Math.max(x0 + r, Math.min(x1 - r, px)), cy = Math.max(y0 + r, Math.min(y1 - r, py));
    return Math.hypot(px - cx, py - cy) <= r;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const px = (x + (sx + 0.5) / SS) / k, py = (y + (sy + 0.5) / SS) / k;
      let c = null;
      if (inRoundRect(px, py, 4, 3, 28, 29, 4)) {
        c = [0xff, 0xd6, 0x0a];
        if (py < 9) c = [0x3a, 0x3a, 0x3c];
        else if (px > 9 && px < 23 && [14, 19, 24].some((ly) => Math.abs(py - ly) <= 1.1)) c = [0x5a, 0x48, 0x00];
      }
      if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
    }
    const n = SS * SS, i = (y * size + x) * 4;
    // BGRA、預乘 alpha
    buf[i] = b / n; buf[i + 1] = g / n; buf[i + 2] = r / n; buf[i + 3] = (a / n) * 255;
  }
  return buf;
}

function trayIcon(size = 32) {
  return nativeImage.createFromBitmap(drawIconBitmap(size), { width: size, height: size });
}

function loginItemArgs() {
  return app.isPackaged ? [] : [path.resolve(__dirname)];
}

function buildTrayMenu() {
  const exePath = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  const openAtLogin = app.getLoginItemSettings({ path: exePath, args: loginItemArgs() }).openAtLogin;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `專案筆記 v${app.getVersion()}`, enabled: false },
    { type: 'separator' },
    { label: '快速切換專案 (Ctrl+Alt+N)', click: () => showWin('launcher') },
    { label: '管理筆記', click: () => showWin('full') },
    { label: '開機自動啟動', type: 'checkbox', checked: openAtLogin, click: (item) => {
        app.setLoginItemSettings({ openAtLogin: item.checked, path: exePath, args: loginItemArgs() });
      } },
    { type: 'separator' },
    { label: '結束', click: () => { app.isQuitting = true; app.quit(); } },
  ]));
}

app.whenReady().then(() => {
  loadData();

  ipcMain.on('get-version', (e) => { e.returnValue = app.getVersion(); });
  ipcMain.on('list', (e) => { e.returnValue = data.projects; });
  ipcMain.on('add', (e, fields) => {
    const p = store.touch(data, fields.path, { open: false });
    if (fields.name) p.name = String(fields.name);
    changed();
    e.returnValue = p;
  });
  ipcMain.on('update', (_e, id, patch) => { if (store.update(data, id, patch)) changed(); });
  ipcMain.on('complete', (_e, id) => {
    const p = data.projects.find((x) => x.id === id);
    if (p && store.completeNext(p)) changed();
  });
  ipcMain.on('remove', (_e, id) => { if (store.remove(data, id)) changed(); });
  ipcMain.on('open-folder', (_e, id) => {
    const p = data.projects.find((x) => x.id === id); // 只開清單裡有的專案路徑
    if (p) shell.openPath(p.path);
  });
  ipcMain.handle('launch-claude', (_e, id, cont) => {
    const p = data.projects.find((x) => x.id === id);
    return p ? launchClaude(p, cont) : { ok: false, error: '找不到這個專案' };
  });
  ipcMain.on('set-mode', (_e, m) => { if (SIZES[m] && m !== mode) showWin(m); });
  ipcMain.on('reminder-answer', (_e, reqId, action) => finishReminder(reqId, action === 'run' ? 'run' : 'later'));

  createWindow();
  startServer();

  // 16px 給一般螢幕，另外附 32px 給高解析度（150%/200% 縮放）螢幕
  const trayImg = trayIcon(16);
  trayImg.addRepresentation({ scaleFactor: 2, width: 32, height: 32, buffer: drawIconBitmap(32) });
  tray = new Tray(trayImg);
  tray.setToolTip(`專案筆記 v${app.getVersion()} — Ctrl+Alt+N`);
  tray.on('click', toggleWin);
  buildTrayMenu();

  if (!globalShortcut.register(HOTKEY, toggleWin)) {
    console.error('快捷鍵註冊失敗，可能被其他程式佔用：' + HOTKEY);
  }

  ipcMain.on('win', (_e, action) => {
    if (action === 'hide') win.hide();
    if (action === 'show') showWin();
    if (action === 'pin') { pinned = true; showWin(); }
    if (action === 'unpin') pinned = pendingReminders.size > 0;
  });
});

module.exports = { launches }; // 給測試看

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (saveTimer) saveNow();
  for (const reqId of [...pendingReminders.keys()]) finishReminder(reqId, 'later');
});
app.on('window-all-closed', (e) => e.preventDefault());
