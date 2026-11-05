// 快速切換（launcher）測試：搜尋、鍵盤選擇、Enter／Shift+Enter 開 Claude Code、Tab 看筆記、貼路徑開新資料夾
// 執行：./node_modules/electron/dist/electron.exe tools/run-in-app.js tools/launcher-test.js
// 測試模式下 main.js 不會真的開 Claude Code，只記在 launches 裡。
const os = require('os');
const fs = require('fs');
const path = require('path');
const { launches } = require('../main.js');
const wait = (ms) => new Promise(r => setTimeout(r, ms));

module.exports = async ({ page, win }) => {
  const out = {};
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-launch-'));
  const dirs = ['Alpha', 'Beta', 'Gamma'].map(n => { const d = path.join(base, n); fs.mkdirSync(d); return d; });
  const key = (k, shift) => page(`launcherKey(new KeyboardEvent('keydown', { key: '${k}', shiftKey: ${!!shift} }))`);
  const type = (v) => page(`document.getElementById('launcherInput').value = ${JSON.stringify(v)}; launcherIndex = 0; renderLauncher()`);

  for (const d of dirs) await page(`api.add({ path: ${JSON.stringify(d)} })`);
  await wait(200);
  await page(`setMode('launcher', true)`);
  await wait(200);
  out.startsInLauncher = await page(`mode === 'launcher' && document.getElementById('win').classList.contains('launcher')`);
  out.windowSize = win.getSize();
  out.itemCount = await page(`document.querySelectorAll('.launcher-item').length`);

  // 搜尋 + Enter
  await type('bet');
  out.filtered = await page(`launcherItems().map(it => it.p.name)`);
  await key('Enter');
  await wait(100);
  // 下移 + Shift+Enter（接續上次對話）
  await type('');
  await key('ArrowDown');
  out.selectedAfterDown = await page(`launcherItems()[launcherIndex].p.name`);
  await key('Enter', true);
  await wait(100);
  out.launches = launches.map(l => ({ name: path.basename(l.path), cont: l.cont }));
  await wait(200);
  out.betaOpenedFirstNow = await page(`sortedProjects()[0].name`); // 開過的排到最前面

  // 路徑不存在 → 顯示錯誤
  const missing = path.join(base, 'Nope');
  await type(missing);
  out.newItemShown = await page(`launcherItems().slice(-1)[0].type`);
  await key('Enter');
  await wait(100);
  out.missingError = await page(`document.getElementById('launcherError').textContent`);

  // 貼上存在的新資料夾路徑 → 加入並開啟
  const fresh = path.join(base, 'Delta'); fs.mkdirSync(fresh);
  await type(fresh);
  await key('Enter');
  await wait(200);
  out.freshAdded = await page(`projects.some(p => p.name === 'Delta')`);
  out.lastLaunch = path.basename(launches[launches.length - 1].path);

  // Tab → 完整筆記，選到那個專案
  await type('gamma');
  await key('Tab');
  await wait(300);
  out.fullMode = await page(`mode`);
  out.fullSize = win.getSize();
  out.selected = await page(`current().name`);
  // Esc 回 launcher
  await page(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
  await wait(300);
  out.backToLauncher = await page(`mode`);
  return out;
};
