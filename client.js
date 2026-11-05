// hook.js 和 cli.js 共用：跟正在執行的接管筆記 App 溝通（127.0.0.1 本機 HTTP）。
// App 沒開的話，會自動把它啟動起來再試一次。
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const PORT = Number(process.env.PROJECT_NOTES_PORT) || 47321;
const ROOT = __dirname;

function request(method, urlPath, body, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body), 'utf8') : null;
    const req = http.request({
      host: '127.0.0.1', port: PORT, path: urlPath, method,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {},
    }, (res) => {
      let s = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { s += c; });
      res.on('end', () => {
        try {
          const json = JSON.parse(s);
          if (res.statusCode >= 400) reject(new Error(json.error || `HTTP ${res.statusCode}`));
          else resolve(json);
        } catch (e) { reject(e); }
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const ping = () => request('GET', '/ping', null, 1500).then((r) => r.app === 'takeover-notes', () => false);

const EXE_NAME = '接管筆記.exe';
const isElectronNode = () => !!process.env.ELECTRON_RUN_AS_NODE;
const isDevElectron = () => path.basename(process.execPath).toLowerCase() === 'electron.exe';

// 要怎麼啟動 App：
//   - 由「接管筆記.exe --hook／--cli」執行時（Node 模式），process.execPath 就是 App 本身
//   - 用一般的 node 執行原始碼時，找 dist 裡最新的打包版；沒有就用原始碼版
function appCommand() {
  if (isElectronNode()) return { exe: process.execPath, args: isDevElectron() ? [ROOT] : [] };
  const dist = path.join(ROOT, 'dist');
  let dirs = [];
  try {
    dirs = fs.readdirSync(dist).filter((d) => /^TakeoverNotes-[\d.]+-win-x64$/.test(d)
      && fs.existsSync(path.join(dist, d, EXE_NAME)));
  } catch {}
  const ver = (d) => d.match(/[\d.]+(?=-win)/)[0].split('.').map(Number);
  dirs.sort((a, b) => {
    const va = ver(a), vb = ver(b);
    for (let i = 0; i < 3; i++) if ((va[i] || 0) !== (vb[i] || 0)) return (vb[i] || 0) - (va[i] || 0);
    return 0;
  });
  if (dirs.length) return { exe: path.join(dist, dirs[0], EXE_NAME), args: [] };
  return { exe: path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe'), args: [ROOT] };
}

// 給 Claude 看的「怎麼更新筆記」指令（不同安裝方式指令不同）
function cliCommand() {
  const q = (p) => '"' + p.replace(/\\/g, '/') + '"';
  const { exe, args } = appCommand();
  if (isElectronNode() || !fs.existsSync(path.join(ROOT, 'cli.js'))) return [q(exe), ...args.map(q), '--cli'].join(' ');
  return 'node ' + q(path.join(ROOT, 'cli.js'));
}

async function ensureApp() {
  if (await ping()) return true;
  if (process.env.PROJECT_NOTES_NO_LAUNCH) return false; // 測試時不要自己開 App
  const { exe, args } = appCommand();
  if (!fs.existsSync(exe)) return false;
  // 一定要拿掉 ELECTRON_RUN_AS_NODE，否則啟動的 App 也會變成 Node 模式、什麼都不做
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  spawn(exe, args, { detached: true, stdio: 'ignore', env }).unref();
  for (let i = 0; i < 40; i++) { // 最多等 10 秒
    await new Promise((r) => setTimeout(r, 250));
    if (await ping()) return true;
  }
  return false;
}

module.exports = { PORT, request, ping, ensureApp, appCommand, cliCommand };
