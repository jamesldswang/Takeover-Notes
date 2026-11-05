// hook.js 和 cli.js 共用：跟正在執行的專案筆記 App 溝通（127.0.0.1 本機 HTTP）。
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

const ping = () => request('GET', '/ping', null, 1500).then((r) => r.app === 'project-notes', () => false);

// 找最新的打包版 dist/ProjectNotes-<版號>-win-x64/專案筆記.exe；沒有的話用原始碼版
function appCommand() {
  const dist = path.join(ROOT, 'dist');
  let dirs = [];
  try {
    dirs = fs.readdirSync(dist).filter((d) => /^ProjectNotes-[\d.]+-win-x64$/.test(d)
      && fs.existsSync(path.join(dist, d, '專案筆記.exe')));
  } catch {}
  const ver = (d) => d.match(/[\d.]+(?=-win)/)[0].split('.').map(Number);
  dirs.sort((a, b) => {
    const va = ver(a), vb = ver(b);
    for (let i = 0; i < 3; i++) if ((va[i] || 0) !== (vb[i] || 0)) return (vb[i] || 0) - (va[i] || 0);
    return 0;
  });
  if (dirs.length) return { exe: path.join(dist, dirs[0], '專案筆記.exe'), args: [] };
  return { exe: path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe'), args: [ROOT] };
}

async function ensureApp() {
  if (await ping()) return true;
  if (process.env.PROJECT_NOTES_NO_LAUNCH) return false; // 測試時不要自己開 App
  const { exe, args } = appCommand();
  if (!fs.existsSync(exe)) return false;
  spawn(exe, args, { detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 40; i++) { // 最多等 10 秒
    await new Promise((r) => setTimeout(r, 250));
    if (await ping()) return true;
  }
  return false;
}

module.exports = { PORT, request, ping, ensureApp, appCommand };
