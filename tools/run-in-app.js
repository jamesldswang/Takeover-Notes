// 在真正的 App 裡執行一段測試，並印出結果。
//
// 用法（在 ProjectNotes 資料夾）：
//   ./node_modules/electron/dist/electron.exe tools/run-in-app.js <測試檔.js>
//
// 測試檔是一個 Node 模組，匯出一個 async 函式，在 Electron 主程式裡執行：
//   module.exports = async ({ page, win, port, userData, runHook, runCli }) => { ...; return 結果; };
//   - page(js)        在 notes.html 頁面裡執行一段 JS，回傳最後一個運算式的值（可以是 Promise）
//   - runHook(input)  用 node 執行 hook.js，stdin 是 input（JSON），回傳 { code, stdout, stderr }。
//                     回傳的是 Promise；提醒視窗要在 page() 裡按按鈕，它才會結束。
//   - runCli(args)    用 node 執行 cli.js，回傳 { code, stdout, stderr }
// 回傳值會以 JSON 印成一行 `RESULT {...}`。
//
// 用獨立的暫存資料夾當 userData、Claude Code 設定資料夾（CLAUDE_CONFIG_DIR）、用另一個 port，
// 不會動到使用者真正的筆記和 Claude Code 設定。測試檔可以拿到 claudeDir 檢查 settings.json。
// 執行前要先關掉正在跑的接管筆記 App，否則單一實例鎖會讓這個程式直接結束。
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { app, BrowserWindow, shell } = require('electron');

const testFile = process.argv.find(a => a.endsWith('.js') && !a.endsWith('run-in-app.js'));
if (!testFile) { console.error('用法：electron tools/run-in-app.js <測試檔.js>'); process.exit(2); }

const ROOT = path.join(__dirname, '..');
const port = String(47390 + Math.floor(Math.random() * 9));
process.env.PROJECT_NOTES_PORT = port;
process.env.PROJECT_NOTES_TEST = '1'; // 測試時不寫剪貼簿、不搬舊資料
process.env.PROJECT_NOTES_IDLE_MS = process.env.PROJECT_NOTES_IDLE_MS || '1500'; // 閒置提醒不用真的等 30 分鐘
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-test-'));
const claudeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-claude-'));
process.env.CLAUDE_CONFIG_DIR = claudeDir;
shell.openPath = async () => ''; // 不要真的打開檔案總管
require(path.join(ROOT, 'main.js'));
app.setPath('userData', userData); // 要在 main.js 的 app.setName() 之後設，否則會被蓋回 %APPDATA%\接管筆記

function runNode(script, args, stdin) {
  return new Promise((resolve) => {
    const child = spawn('node', [path.join(ROOT, script), ...args], {
      env: { ...process.env, PROJECT_NOTES_PORT: port, PROJECT_NOTES_NO_LAUNCH: '1', ELECTRON_RUN_AS_NODE: '' },
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', c => { stdout += c; });
    child.stderr.on('data', c => { stderr += c; });
    child.on('close', code => resolve({ code, stdout, stderr }));
    if (stdin !== undefined) child.stdin.end(typeof stdin === 'string' ? stdin : JSON.stringify(stdin));
    else child.stdin.end();
  });
}

app.whenReady().then(async () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win.webContents.isLoading()) await new Promise(r => win.webContents.once('did-finish-load', r));
  await new Promise(r => setTimeout(r, 300)); // 等 HTTP server 起來
  let exitCode = 0;
  try {
    const test = require(path.resolve(testFile));
    const result = await test({
      win, port, userData, claudeDir,
      page: (js) => win.webContents.executeJavaScript(js),
      runHook: (input) => runNode('hook.js', [], input),
      runCli: (args) => runNode('cli.js', args),
    });
    console.log('RESULT ' + JSON.stringify(result));
  } catch (e) {
    console.log('ERROR ' + (e && e.stack || e));
    exitCode = 1;
  }
  app.isQuitting = true;
  app.exit(exitCode);
});
