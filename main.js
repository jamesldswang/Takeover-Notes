const path = require('path');

// ---------- 命令列模式 ----------
// 「接管筆記.exe --hook」：Claude Code 的 SessionStart hook；「接管筆記.exe --cli ...」：命令列更新筆記。
// Electron 主程式讀不到 stdin，所以用 Node 模式（ELECTRON_RUN_AS_NODE）再執行自己一次，
// stdin／stdout 直接繼承。這樣另一台電腦不用安裝 Node.js。
{
  const flag = ['--hook', '--cli'].find((f) => process.argv.includes(f));
  if (flag) {
    const { spawnSync } = require('child_process');
    const script = path.join(__dirname, flag === '--hook' ? 'hook.js' : 'cli.js');
    const r = spawnSync(process.execPath, [script, ...process.argv.slice(process.argv.indexOf(flag) + 1)], {
      stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    });
    process.exit(r.status == null ? 0 : r.status);
  }
}

const { app, BrowserWindow, globalShortcut, Tray, Menu, nativeImage, ipcMain, screen, shell, clipboard, dialog } = require('electron');
const fs = require('fs');
const http = require('http');
const os = require('os');
const { spawn } = require('child_process');
const store = require('./store');
const claudeSetup = require('./claude-setup');

const APP_NAME = '接管筆記';
const HOTKEY = 'Control+Alt+N'; // Fn 鍵 Windows 偵測不到，所以用 Ctrl+Alt+N
const PORT = Number(process.env.PROJECT_NOTES_PORT) || 47321; // hook.js / cli.js 用這個 port 跟 App 溝通
// 兩種模式：launcher = 快速切換（Ctrl+Alt+N 一叫出來就是這個），full = 完整筆記
// 尺寸要和 notes.html 的 .window／.window.launcher 一致
const SIZES = { launcher: [600, 440], full: [760, 580] };
const REMINDER_TIMEOUT_MS = 90 * 1000; // 提醒視窗沒人回應就當成「稍後」（hook 的 timeout 是 120 秒）
const SYNC_POLL_MS = 3000;             // 多久檢查一次資料檔有沒有被別台電腦改過（同步資料夾）
// Claude 停下來之後，專案多久沒動就提醒「下一步要不要記下來」（測試可用環境變數縮短）
const IDLE_MS = Number(process.env.PROJECT_NOTES_IDLE_MS) || 30 * 60 * 1000;

app.setName(APP_NAME); // userData 固定在 %APPDATA%\接管筆記（測試會在這之後改掉）

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

// ---------- 設定（資料放哪裡）----------
// config.json 一定在 userData；notes.json 預設也在 userData，可以改到 OneDrive 之類的同步資料夾。
const configFile = () => path.join(app.getPath('userData'), 'config.json');
let config = {};

function loadConfig() {
  try { config = JSON.parse(fs.readFileSync(configFile(), 'utf8')) || {}; } catch { config = {}; }
}
function saveConfig() {
  fs.mkdirSync(path.dirname(configFile()), { recursive: true });
  fs.writeFileSync(configFile(), JSON.stringify(config, null, 2), 'utf8');
}
const defaultDataDir = () => app.getPath('userData');
const dataDir = () => config.dataDir || defaultDataDir();
const dataFile = () => path.join(dataDir(), 'notes.json');

// ---------- 資料 ----------
let data = { projects: [], deleted: [] };
let saveTimer = null;
let knownMtime = 0; // 最後一次讀／寫時資料檔的修改時間；不一樣就代表別台電腦改過

function readFileData(file) {
  return store.normalize(JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')));
}
const mtime = (file) => { try { return fs.statSync(file).mtimeMs; } catch { return 0; } };

// 改名前叫「專案筆記」，資料在 %APPDATA%\專案筆記：第一次啟動時搬過來
function migrateOldData() {
  if (process.env.PROJECT_NOTES_TEST) return;
  const oldFile = path.join(app.getPath('appData'), '專案筆記', 'notes.json');
  const newFile = path.join(defaultDataDir(), 'notes.json');
  if (!config.dataDir && !fs.existsSync(newFile) && fs.existsSync(oldFile)) {
    fs.mkdirSync(path.dirname(newFile), { recursive: true });
    fs.copyFileSync(oldFile, newFile);
  }
}

function loadData() {
  try { data = readFileData(dataFile()); } catch { data = { projects: [], deleted: [] }; }
  knownMtime = mtime(dataFile());
}

function saveNow() {
  clearTimeout(saveTimer); saveTimer = null;
  const file = dataFile();
  try {
    // 寫之前先看別台電腦有沒有改過，有的話先合併，避免蓋掉對方的內容
    if (mtime(file) && mtime(file) !== knownMtime) {
      try { data = store.merge(data, readFileData(file)); } catch {}
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, file); // 先寫暫存檔再改名，寫到一半當掉也不會弄壞原檔
    knownMtime = mtime(file);
  } catch (e) { console.error('儲存失敗：', e); }
}

// 資料有變：稍後寫檔，並通知畫面重畫
function changed() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 300);
  sendProjects();
}

// 送給畫面的專案多一個 localPath：這台電腦上存在的路徑（找不到就是空字串）
function localPath(p) {
  return [p.path, ...p.paths].find((x) => { try { return fs.existsSync(x); } catch { return false; } }) || '';
}
const viewProjects = () => data.projects.map((p) => ({ ...p, localPath: localPath(p) }));
function sendProjects() {
  if (win && !win.isDestroyed()) win.webContents.send('data-changed', viewProjects());
}

// 資料檔被別台電腦（同步資料夾）改過：讀進來合併
function pollDataFile() {
  const m = mtime(dataFile());
  if (!m || m === knownMtime || saveTimer) return;
  try {
    const disk = readFileData(dataFile());
    knownMtime = m;
    const merged = store.merge(data, disk);
    const differsFromDisk = store.canon(merged) !== store.canon(disk);
    data = merged;
    sendProjects();
    if (differsFromDisk) changed(); // 本機有對方沒有的內容，寫回去
    fillRemotes();
  } catch { /* 同步軟體寫到一半，下次再讀 */ }
}

// ---------- git remote（換電腦時用來認出同一個專案）----------
function gitRemote(dir) {
  try {
    let d = path.resolve(dir);
    for (;;) {
      const g = path.join(d, '.git');
      if (fs.existsSync(g)) {
        let gitDir = g;
        if (fs.statSync(g).isFile()) { // worktree／submodule：.git 是一個指向真正 git 資料夾的檔案
          const m = fs.readFileSync(g, 'utf8').match(/gitdir:\s*(.+)/);
          if (!m) return '';
          gitDir = path.resolve(d, m[1].trim());
        }
        const cfg = fs.readFileSync(path.join(gitDir, 'config'), 'utf8');
        const m = cfg.match(/\[remote "origin"\][^[]*?url\s*=\s*(\S+)/);
        return m ? m[1] : '';
      }
      const parent = path.dirname(d);
      if (parent === d) return '';
      d = parent;
    }
  } catch { return ''; }
}

const touch = (cwd, opts = {}) => store.touch(data, cwd, { ...opts, remote: gitRemote(cwd) });

// 舊專案補上 git remote，並把另一台電腦重複新增的同一個專案併起來；有改變就存檔
function fillRemotes() {
  if (store.fillRemotes(data, (p) => { const d = localPath(p); return d ? gitRemote(d) : ''; })) changed();
}

// ---------- Claude Code 整合 ----------
const hookCmd = () => claudeSetup.hookCommand({ execPath: process.execPath, appDir: __dirname, packaged: app.isPackaged });

function settingsInfo() {
  return {
    hook: claudeSetup.status(hookCmd()),
    dataDir: dataDir(),
    dataFile: dataFile(),
    defaultDataDir: defaultDataDir(),
    usingDefault: !config.dataDir,
  };
}

// 系統對話框會讓視窗失焦被收起來，開之前先 pin 住
async function withPinned(fn) {
  const was = pinned;
  pinned = true;
  try { return await fn(); } finally { pinned = was || pendingReminders.size > 0; }
}

async function chooseDataDir() {
  return withPinned(async () => {
    const r = await dialog.showOpenDialog(win, {
      title: '選擇資料要放的資料夾（例如 OneDrive 裡的資料夾）',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (r.canceled || !r.filePaths[0]) return { ok: false };
    return setDataDir(r.filePaths[0]);
  });
}

// 換資料夾：目標已經有 notes.json（例如另一台電腦放的）就合併
function setDataDir(dir) {
  try {
    const target = path.join(dir, 'notes.json');
    let merged = data;
    if (fs.existsSync(target)) merged = store.merge(data, readFileData(target));
    flushSave();
    config.dataDir = path.resolve(dir) === path.resolve(defaultDataDir()) ? undefined : path.resolve(dir);
    saveConfig();
    data = merged;
    knownMtime = mtime(target);
    saveNow();
    sendProjects();
    fillRemotes();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function exportData() {
  return withPinned(async () => {
    const d = new Date(), pad = (n) => String(n).padStart(2, '0');
    const r = await dialog.showSaveDialog(win, {
      title: '匯出接管筆記',
      defaultPath: path.join(app.getPath('documents'), `接管筆記-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (r.canceled || !r.filePath) return { ok: false };
    fs.writeFileSync(r.filePath, JSON.stringify(data, null, 2), 'utf8');
    return { ok: true, file: r.filePath };
  });
}

async function importData() {
  return withPinned(async () => {
    const r = await dialog.showOpenDialog(win, {
      title: '匯入接管筆記（會和現有的筆記合併）',
      filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['openFile'],
    });
    if (r.canceled || !r.filePaths[0]) return { ok: false };
    try {
      const before = data.projects.length;
      data = store.merge(data, readFileData(r.filePaths[0]));
      changed();
      return { ok: true, added: data.projects.length - before, total: data.projects.length };
    } catch (e) {
      return { ok: false, error: '這個檔案不是接管筆記的匯出檔：' + e.message };
    }
  });
}

function flushSave() { if (saveTimer) saveNow(); }

// ---------- 視窗 ----------
function createWindow() {
  win = new BrowserWindow({
    width: SIZES.launcher[0], height: SIZES.launcher[1],
    frame: false, transparent: true, resizable: false,
    show: false, skipTaskbar: true, alwaysOnTop: true,
    icon: trayIcon(),
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  // 測試時視窗會出現在使用者螢幕上；不接收滑鼠，避免使用者剛好移動或點到而影響測試結果
  if (process.env.PROJECT_NOTES_TEST) win.setIgnoreMouseEvents(true);
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
  const dir = localPath(p);
  if (!dir) return { ok: false, error: `這台電腦找不到「${p.name}」的資料夾（記錄的路徑：${p.path}）。把這台電腦上的資料夾路徑貼到搜尋框，按 Enter 就會接上。` };
  touch(dir);
  changed();
  if (process.env.PROJECT_NOTES_TEST) { launches.push({ path: dir, cont: !!cont }); return { ok: true }; }
  const title = ('Claude Code - ' + p.name).replace(/["^&|<>%]/g, '');
  const cmd = `/d /c start "${title}" /D "${dir}" "${claudeExe()}"${cont ? ' --continue' : ''}`;
  spawn('cmd.exe', [cmd], { detached: true, stdio: 'ignore', windowsVerbatimArguments: true, windowsHide: true }).unref();
  win.hide();
  return { ok: true };
}

// ---------- 開啟專案時的提醒 ----------
// hook.js 送來 /session-start 後，HTTP 回應會等到使用者在畫面上按下按鈕才送出。
const pendingReminders = new Map(); // reqId -> { projectId, resolve, timer, sent }
let reminderSeq = 0;

// kind：'open' = 開啟專案時（hook 在等回答，90 秒逾時）；
//       'idle' = Claude 停下來 30 分鐘沒動（沒有人在等，不逾時，一直留到使用者回答或專案又開始動）
function askReminder(project, kind = 'open', extra = {}) {
  return new Promise((resolve) => {
    const reqId = String(++reminderSeq);
    const timer = kind === 'open' ? setTimeout(() => finishReminder(reqId, 'timeout'), REMINDER_TIMEOUT_MS) : null;
    pendingReminders.set(reqId, { projectId: project.id, kind, extra, resolve, timer, sent: false });
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
    win.webContents.send('reminder', { reqId, projectId: r.projectId, kind: r.kind, ...r.extra });
  }
}

// ---------- 閒置提醒 ----------
// hook.js 在 UserPromptSubmit／Stop／SessionEnd 時送 /activity 過來。
// Claude 停下來（stop）後 IDLE_MS 內沒有再開始做事（prompt）、也沒關掉（end），
// 而且這一輪筆記沒被更新過（Claude 沒自動記、使用者也沒改），就跳出提醒問下一步要不要記下來。
const activity = new Map(); // projectId -> { turnAt, stopAt, suggestion, sessions: Set, timer }

function pendingIdleReminder(projectId) {
  for (const [reqId, r] of pendingReminders) if (r.kind === 'idle' && r.projectId === projectId) return reqId;
  return null;
}

function onActivity({ event, cwd, at, sessionId, lastMessage }) {
  const p = store.findByPath(data, cwd || '', { remote: gitRemote(cwd || '.') });
  if (!p) return null;
  at = Number(at) || Date.now();
  let st = activity.get(p.id);
  if (!st) activity.set(p.id, st = { turnAt: 0, stopAt: 0, suggestion: '', sessions: new Set(), timer: null });
  if (sessionId) st.sessions.add(sessionId);
  if (event === 'prompt') {
    if (at < st.stopAt) return p; // 背景 hook 晚到：比上一次停下來還舊的開始，忽略
    st.turnAt = at;
    clearTimeout(st.timer); st.timer = null;
    const old = pendingIdleReminder(p.id); // 已經回來繼續做了，閒置提醒收掉
    if (old) finishReminder(old, 'timeout');
  } else if (event === 'stop') {
    if (at < st.turnAt) return p;
    st.stopAt = at;
    st.suggestion = store.suggestNext(lastMessage || '');
    clearTimeout(st.timer);
    st.timer = setTimeout(() => idleFired(p.id), IDLE_MS);
  } else if (event === 'end') {
    if (sessionId) st.sessions.delete(sessionId);
    if (!st.sessions.size) { clearTimeout(st.timer); st.timer = null; }
  }
  return p;
}

function idleFired(projectId) {
  const st = activity.get(projectId);
  if (st) st.timer = null;
  const p = data.projects.find((x) => x.id === projectId);
  if (!st || !p || !p.remind || pendingIdleReminder(projectId)) return;
  // 這一輪開始之後筆記已經更新過（Claude 自動記了，或使用者自己改了），就不用再問
  const since = st.turnAt || st.stopAt;
  if (Date.parse(p.updatedAt) >= since) return;
  askReminder(p, 'idle', { suggestion: st.suggestion, minutes: Math.round(IDLE_MS / 60000) });
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
      if (req.method === 'GET' && req.url === '/ping') return reply(200, { ok: true, app: 'takeover-notes' });
      if (req.method !== 'POST') return reply(404, { error: 'not found' });
      const body = await readBody(req);

      if (req.url === '/session-start') {
        if (!body.cwd) return reply(400, { error: 'cwd 必填' });
        const p = touch(body.cwd);
        changed();
        const wantsReminder = p.remind && p.next.trim() && ['startup', 'resume', undefined].includes(body.source);
        if (!wantsReminder) return reply(200, { action: 'none', project: p });
        return reply(200, await askReminder(p));
      }

      if (req.url === '/activity') {
        if (!['prompt', 'stop', 'end'].includes(body.event)) return reply(400, { error: 'event 不對' });
        const p = onActivity(body);
        return reply(200, { ok: true, project: p ? p.id : null });
      }

      if (req.url === '/get') {
        const p = store.findByPath(data, body.cwd || '', { remote: gitRemote(body.cwd || '.') });
        return reply(200, { project: p || null });
      }

      if (req.url === '/update') {
        if (!body.cwd) return reply(400, { error: 'cwd 必填' });
        const p = touch(body.cwd, { open: false });
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
  const hookState = claudeSetup.status(hookCmd()).state;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `${APP_NAME} v${app.getVersion()}`, enabled: false },
    { type: 'separator' },
    { label: '快速切換專案 (Ctrl+Alt+N)', click: () => showWin('launcher') },
    { label: '管理筆記', click: () => showWin('full') },
    { label: '設定…', click: () => { showWin('full'); win.webContents.send('open-settings'); } },
    { type: 'separator' },
    { label: hookState === 'connected' ? '已連接 Claude Code' : '連接 Claude Code（開啟專案時提醒）',
      type: 'checkbox', checked: hookState === 'connected', click: (item) => {
        try { item.checked ? claudeSetup.install(hookCmd()) : claudeSetup.uninstall(); }
        catch (e) { dialog.showErrorBox(APP_NAME, '無法修改 Claude Code 設定：' + e.message); }
        buildTrayMenu();
      } },
    { label: '開機自動啟動', type: 'checkbox', checked: openAtLogin, click: (item) => {
        app.setLoginItemSettings({ openAtLogin: item.checked, path: exePath, args: loginItemArgs() });
      } },
    { type: 'separator' },
    { label: '結束', click: () => { app.isQuitting = true; app.quit(); } },
  ]));
}

app.whenReady().then(() => {
  loadConfig();
  migrateOldData();
  loadData();
  fillRemotes();
  setInterval(pollDataFile, SYNC_POLL_MS);

  ipcMain.on('get-version', (e) => { e.returnValue = app.getVersion(); });
  ipcMain.on('list', (e) => { e.returnValue = viewProjects(); });
  ipcMain.on('add', (e, fields) => {
    const p = touch(fields.path, { open: false });
    if (fields.name) store.update(data, p.id, { name: fields.name });
    changed();
    e.returnValue = { ...p, localPath: localPath(p) };
  });
  ipcMain.on('update', (_e, id, patch) => { if (store.update(data, id, patch)) changed(); });
  ipcMain.on('complete', (_e, id) => {
    const p = data.projects.find((x) => x.id === id);
    if (p && store.completeNext(p)) changed();
  });
  ipcMain.on('remove', (_e, id) => { if (store.remove(data, id)) changed(); });
  ipcMain.on('open-folder', (_e, id) => {
    const p = data.projects.find((x) => x.id === id); // 只開清單裡有的專案路徑
    if (p && localPath(p)) shell.openPath(localPath(p));
  });
  ipcMain.handle('launch-claude', (_e, id, cont) => {
    const p = data.projects.find((x) => x.id === id);
    return p ? launchClaude(p, cont) : { ok: false, error: '找不到這個專案' };
  });
  ipcMain.on('set-mode', (_e, m) => { if (SIZES[m] && m !== mode) showWin(m); });
  ipcMain.on('reminder-answer', (_e, reqId, action) => finishReminder(reqId, action === 'run' ? 'run' : 'later'));

  // 設定
  ipcMain.on('get-settings', (e) => { e.returnValue = settingsInfo(); });
  ipcMain.handle('connect-claude', () => {
    try { claudeSetup.install(hookCmd()); buildTrayMenu(); return { ok: true }; }
    catch (e) { return { ok: false, error: 'Claude Code 的 settings.json 格式有問題，沒有修改：' + e.message }; }
  });
  ipcMain.handle('disconnect-claude', () => {
    try { claudeSetup.uninstall(); buildTrayMenu(); return { ok: true }; }
    catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('choose-data-dir', () => chooseDataDir());
  ipcMain.handle('reset-data-dir', () => setDataDir(defaultDataDir()));
  ipcMain.handle('export-data', () => exportData());
  ipcMain.handle('import-data', () => importData());
  ipcMain.on('open-data-dir', () => shell.openPath(dataDir()));

  createWindow();
  startServer();

  // 16px 給一般螢幕，另外附 32px 給高解析度（150%/200% 縮放）螢幕
  const trayImg = trayIcon(16);
  trayImg.addRepresentation({ scaleFactor: 2, width: 32, height: 32, buffer: drawIconBitmap(32) });
  tray = new Tray(trayImg);
  tray.setToolTip(`${APP_NAME} v${app.getVersion()} — Ctrl+Alt+N`);
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

module.exports = { launches, setDataDir, pollDataFile, getData: () => data }; // 給測試用

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  flushSave();
  for (const reqId of [...pendingReminders.keys()]) finishReminder(reqId, 'later');
});
app.on('window-all-closed', (e) => e.preventDefault());
