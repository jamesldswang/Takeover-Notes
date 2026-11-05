// 範例測試：完整走一次「Claude Code 開啟專案 → 跳出提醒 → 按立刻執行 → hook 輸出」
// 執行：./node_modules/electron/dist/electron.exe tools/run-in-app.js tools/example-test.js
const wait = (ms) => new Promise(r => setTimeout(r, ms));

module.exports = async ({ page, runHook, runCli }) => {
  const out = {};
  const dir = 'C:/Users/user/FakeProject';

  // 1. 第一次開啟：自動加入清單，沒有下一步所以不提醒
  const first = await runHook({ cwd: dir, source: 'startup', hook_event_name: 'SessionStart' });
  out.firstHookHasContext = JSON.parse(first.stdout).hookSpecificOutput.additionalContext.includes('FakeProject');
  await wait(200);
  out.listAfterFirst = await page(`projects.map(p => p.name)`);

  // 2. 用 cli 記錄進度和下一步
  const cli = await runCli(['--cwd', dir + '/src', '--progress', '畫面完成', '--next', '寫登入 API']);
  out.cliOk = cli.code === 0 && cli.stdout.includes('寫登入 API');

  // 3. 再開一次（在子資料夾也算同一個專案）：跳出提醒，按「立刻執行」
  const hook = runHook({ cwd: dir + '/src', source: 'startup' });
  for (let i = 0; i < 40 && !(await page(`document.getElementById('reminderModal').classList.contains('show')`)); i++) await wait(100);
  out.reminderTitle = await page(`document.getElementById('reminderTitle').textContent`);
  await page(`document.getElementById('reminderNext').value = '寫登入 API 和測試'; answerReminder('run')`);
  const res = JSON.parse((await hook).stdout);
  out.systemMessage = res.systemMessage;
  out.contextSaysRun = res.hookSpecificOutput.additionalContext.includes('立刻執行');
  out.contextHasEditedNext = res.hookSpecificOutput.additionalContext.includes('寫登入 API 和測試');

  // 4. 完成下一步 → 進完成紀錄
  await runCli(['--cwd', dir, '--done', '--next', '部署']);
  await wait(200);
  out.afterDone = await page(`(({ next, history }) => ({ next, history: history.map(h => h.text) }))(projects[0])`);

  // 5. 家目錄不記錄
  await runHook({ cwd: require('os').homedir(), source: 'startup' });
  out.count = await page(`projects.length`);
  return out;
};
