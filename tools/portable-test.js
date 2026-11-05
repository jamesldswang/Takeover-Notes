// 換電腦／同步測試：連接 Claude Code、同步資料夾、兩台電腦同時改、匯入的路徑對應
// 執行：./node_modules/electron/dist/electron.exe tools/run-in-app.js tools/portable-test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const store = require('../store');
const { setDataDir, pollDataFile, getData } = require('../main.js');
const wait = (ms) => new Promise(r => setTimeout(r, ms));

module.exports = async ({ page, claudeDir, runHook }) => {
  const out = {};
  const settingsFile = path.join(claudeDir, 'settings.json');

  // 1. 連接 Claude Code：保留使用者原本的設定和其他 hook，換掉舊版「專案筆記」的 hook
  fs.writeFileSync(settingsFile, JSON.stringify({
    theme: 'dark',
    hooks: { SessionStart: [
      { matcher: 'startup|resume', hooks: [{ type: 'command', command: 'node "C:/Users/user/ProjectNotes/hook.js"', timeout: 120 }] },
      { hooks: [{ type: 'command', command: 'echo other' }] },
    ], Stop: [{ hooks: [{ type: 'command', command: 'echo stop' }] }] },
  }));
  out.before = await page(`api.getSettings().hook.state`);           // outdated
  out.bannerBefore = await page(`setMode('launcher', false); document.getElementById('hookBanner').textContent.includes('別的位置')`);
  await page(`connectClaude()`);
  await wait(200);
  const s = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  out.after = await page(`api.getSettings().hook.state`);            // connected
  out.keptTheme = s.theme === 'dark';
  out.keptOtherHooks = JSON.stringify(s).includes('echo other') && JSON.stringify(s).includes('echo stop');
  out.oldHookRemoved = !JSON.stringify(s).includes('ProjectNotes/hook.js');
  out.hookCommand = s.hooks.SessionStart.find(g => g.matcher === 'startup|resume').hooks[0].command;
  out.backup = fs.existsSync(settingsFile + '.takeover-notes.bak');
  out.bannerAfter = await page(`renderHookBanner(); document.getElementById('hookBanner').textContent`);
  await page(`disconnectClaude()`);
  await wait(200);
  out.disconnected = !fs.readFileSync(settingsFile, 'utf8').includes('--hook') && fs.readFileSync(settingsFile, 'utf8').includes('echo other');

  // 2. 壞掉的 settings.json：不能覆蓋
  fs.writeFileSync(settingsFile, '{ broken');
  const r = await page(`api.connectClaude()`);
  out.brokenRefused = !r.ok && fs.readFileSync(settingsFile, 'utf8') === '{ broken';

  // 3. 同步資料夾：本機有 A，同步資料夾裡（另一台電腦放的）有 B 和同一個 repo 的 C
  const sync = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-sync-'));
  const here = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-proj-'));
  const projA = path.join(here, 'A'); fs.mkdirSync(projA);
  const projC = path.join(here, 'C'); fs.mkdirSync(path.join(projC, '.git'), { recursive: true });
  fs.writeFileSync(path.join(projC, '.git', 'config'), '[core]\n\tbare = false\n[remote "origin"]\n\turl = https://github.com/someone/C.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n');
  await page(`api.add({ path: ${JSON.stringify(projA)} })`);
  fs.writeFileSync(path.join(sync, 'notes.json'), JSON.stringify({ projects: [
    { id: 'zzB', path: 'D:\\Other\\B', progress: '另一台的進度', next: '另一台的下一步', updatedAt: '2026-01-01T00:00:00Z' },
    { id: 'zzC', path: 'D:\\Other\\C', remote: 'git@github.com:someone/C.git', next: 'C 的下一步', updatedAt: '2026-01-01T00:00:00Z' },
  ] }));
  out.setDir = setDataDir(sync).ok;
  await wait(300);
  out.mergedNames = (await page(`projects.map(p => p.name).sort()`));
  out.bMissingHere = await page(`projects.find(p => p.name === 'B').localPath === '' && pathHtml(projects.find(p => p.name === 'B')).includes('這台電腦找不到')`);

  // 4. 這台電腦開啟 C（不同路徑、同一個 git remote）→ 認成同一個專案，下一步有提醒
  const hookRes = runHook({ cwd: projC, source: 'startup' });
  for (let i = 0; i < 40 && !(await page(`document.getElementById('reminderModal').classList.contains('show')`)); i++) await wait(100);
  out.reminderForC = await page(`document.getElementById('reminderTitle').textContent`);
  await page(`answerReminder('later')`);
  await hookRes;
  await wait(500);
  const c = getData().projects.find(p => p.next === 'C 的下一步');
  out.cPaths = c.paths.length;          // 2：D:\Other\C 和這台的路徑
  out.projectCount = getData().projects.length;

  // 5. 另一台電腦同時改了同步檔（B 的下一步），本機改 A 的進度 → 兩邊都留下
  await page(`api.update(projects.find(p => p.name === 'A').id, { progress: '本機的進度' })`);
  await wait(500); // 讓本機先寫檔
  const disk = JSON.parse(fs.readFileSync(path.join(sync, 'notes.json'), 'utf8'));
  disk.projects.find(p => p.id === 'zzB').next = '另一台改過的下一步';
  disk.projects.find(p => p.id === 'zzB').updatedAt = new Date(Date.now() + 1000).toISOString();
  fs.writeFileSync(path.join(sync, 'notes.json'), JSON.stringify(disk));
  pollDataFile();
  await wait(800);
  out.afterSync = await page(`({ A: projects.find(p => p.name === 'A').progress, B: projects.find(p => p.name === 'B').next })`);
  const final = JSON.parse(fs.readFileSync(path.join(sync, 'notes.json'), 'utf8'));
  out.diskHasBoth = final.projects.some(p => p.progress === '本機的進度') && final.projects.some(p => p.next === '另一台改過的下一步');
  // 再 poll 一次不應該再寫檔（不會兩台電腦互相改寫）
  const m1 = fs.statSync(path.join(sync, 'notes.json')).mtimeMs;
  pollDataFile(); await wait(800);
  out.stable = fs.statSync(path.join(sync, 'notes.json')).mtimeMs === m1;
  return out;
};
