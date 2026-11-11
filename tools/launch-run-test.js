// 從 App 開 Claude Code 時的「立刻執行」：開啟前先在 App 裡問，按「立刻執行」→ 開 claude 時自動帶第一則訊息，
// 之後 SessionStart hook 不再問第二次，直接拿到 App 的答案。
// 執行：./node_modules/electron/dist/electron.exe tools/run-in-app.js tools/launch-run-test.js
const os = require('os');
const fs = require('fs');
const path = require('path');
const { launches } = require('../main.js');
const wait = (ms) => new Promise(r => setTimeout(r, ms));

module.exports = async ({ page, runHook, runCli }) => {
  const out = {};
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-run-')).replace(/\\/g, '/');
  await runCli(['--cwd', dir, '--name', '執行測試', '--progress', '畫面完成', '--next', '寫登入 API']);
  await wait(200);
  const id = await page(`projects.find(p => p.name === '執行測試').id`);
  const modalShown = () => page(`document.getElementById('reminderModal').classList.contains('show')`);
  const waitModal = async () => { for (let i = 0; i < 40 && !(await modalShown()); i++) await wait(100); };

  // 1. ▶ Claude Code → 先跳出提醒（還沒開）
  await page(`openClaude(${JSON.stringify(id)}, false); 1`);
  await waitModal();
  out.notLaunchedYet = launches.length === 0;
  out.title = await page(`document.getElementById('reminderTitle').textContent`);
  out.laterBtn = await page(`document.getElementById('reminderLaterBtn').textContent`);
  // 改下一步再按立刻執行
  await page(`document.getElementById('reminderNext').value = '寫登入 API 和測試'; answerReminder('run')`);
  await wait(300);
  out.runLaunch = launches[launches.length - 1] && { prompt: launches[0].prompt, cont: launches[0].cont };

  // 2. Claude Code 啟動 → hook 不再問，馬上拿到 run
  const t0 = Date.now();
  const res = JSON.parse((await runHook({ cwd: dir, source: 'startup', hook_event_name: 'SessionStart' })).stdout);
  out.hookFast = Date.now() - t0 < 5000;
  out.noSecondModal = !(await modalShown());
  out.systemMessage = res.systemMessage;
  out.contextAutoRun = res.hookSpecificOutput.additionalContext.includes('自動送出第一則訊息');
  out.contextHasEditedNext = res.hookSpecificOutput.additionalContext.includes('寫登入 API 和測試');

  // 3. 預先的答案只用一次：再開一次 hook → 又會跳出提醒（一般流程）
  const hook2 = runHook({ cwd: dir, source: 'startup' });
  await waitModal();
  out.secondTimeAsksAgain = await modalShown();
  out.secondTitle = await page(`document.getElementById('reminderTitle').textContent`);
  await page(`answerReminder('later')`);
  await hook2;

  // 4. ↻ 接續上次對話 → 按「只開啟，稍後再說」：不帶訊息，hook 收到 later
  await page(`openClaude(${JSON.stringify(id)}, true); 1`);
  await waitModal();
  await page(`answerReminder('later')`);
  await wait(300);
  const last = launches[launches.length - 1];
  out.laterLaunch = { prompt: last.prompt, cont: last.cont };
  const res2 = JSON.parse((await runHook({ cwd: dir, source: 'resume' })).stdout);
  out.laterContext = res2.hookSpecificOutput.additionalContext.includes('稍後再做') && !res2.systemMessage;

  // 5. 沒有下一步的專案：直接開，不問
  await runCli(['--cwd', dir, '--done']);
  await wait(200);
  const n = launches.length;
  await page(`openClaude(${JSON.stringify(id)}, false); 1`);
  await wait(400);
  out.noNextLaunchesDirectly = launches.length === n + 1 && !(await modalShown()) && launches[n].prompt === '';
  return out;
};
