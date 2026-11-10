// 閒置提醒與自動更新：Claude 停下來 → 一段時間沒動 → 跳出「下一步要不要記下來」
// 執行：./node_modules/electron/dist/electron.exe tools/run-in-app.js tools/idle-test.js
// （run-in-app.js 把閒置時間縮成 1.5 秒）
const fs = require('fs');
const os = require('os');
const path = require('path');
const { request } = require('../client');
const claudeSetup = require('../claude-setup');

const wait = (ms) => new Promise(r => setTimeout(r, ms));
const IDLE = Number(process.env.PROJECT_NOTES_IDLE_MS);

module.exports = async ({ page, runHook, runCli, claudeDir }) => {
  const out = {};
  const dir = 'C:/Users/user/IdleProject';
  const shown = () => page(`document.getElementById('reminderModal').classList.contains('show')`);
  const reply = '都改好了，語法檢查通過。\n\n建議下一步\n\n1. 實際錄一段多人對話\n2. 確認打包\n\n另外，要我更新筆記嗎？';

  // 0. 開啟專案；SessionStart 的指示要叫 Claude 自動更新筆記
  const start = JSON.parse((await runHook({ cwd: dir, source: 'startup', hook_event_name: 'SessionStart' })).stdout);
  out.contextAsksAutoUpdate = start.hookSpecificOutput.additionalContext.includes('不用問使用者');
  await runCli(['--cwd', dir, '--progress', 'v0.2', '--next', '舊的下一步']);
  await wait(50);

  // 1. 開始做事 → 停下來（回覆裡有建議下一步）→ 沒動 → 跳出閒置提醒，預先填好建議
  const promptRes = await runHook({ cwd: dir, hook_event_name: 'UserPromptSubmit', session_id: 's1', prompt: 'hi' });
  out.promptHookSilent = promptRes.code === 0 && promptRes.stdout === '';
  await runHook({ cwd: dir, hook_event_name: 'Stop', session_id: 's1', last_assistant_message: reply });
  out.notYet = !(await shown());
  await wait(IDLE + 800);
  out.idleShown = await shown();
  out.idleTitle = await page(`document.getElementById('reminderTitle').textContent`);
  out.idleNext = await page(`document.getElementById('reminderNext').value`);
  out.idleOkBtn = await page(`document.getElementById('reminderRunBtn').textContent`);
  await page(`answerReminder('run')`);
  await wait(200);
  out.savedNext = await page(`projects.find(p => p.name === 'IdleProject').next`);
  out.closedAfter = !(await shown());

  // 2. 按「不用」不會改筆記
  await runHook({ cwd: dir, hook_event_name: 'UserPromptSubmit', session_id: 's1' });
  await runHook({ cwd: dir, hook_event_name: 'Stop', session_id: 's1', last_assistant_message: '下一步：別的事' });
  await wait(IDLE + 800);
  out.secondShown = await shown();
  await page(`answerReminder('later')`);
  await wait(200);
  out.nextAfterNo = await page(`projects.find(p => p.name === 'IdleProject').next`);

  // 3. 這一輪 Claude 已經自動更新筆記 → 不提醒
  await runHook({ cwd: dir, hook_event_name: 'UserPromptSubmit', session_id: 's1' });
  await runCli(['--cwd', dir, '--progress', 'v0.3', '--next', 'Claude 自己記的']);
  await runHook({ cwd: dir, hook_event_name: 'Stop', session_id: 's1', last_assistant_message: reply });
  await wait(IDLE + 800);
  out.autoUpdatedNoReminder = !(await shown());

  // 4. 停下來後很快又開始做事 → 不提醒
  await runHook({ cwd: dir, hook_event_name: 'Stop', session_id: 's1', last_assistant_message: reply });
  await runHook({ cwd: dir, hook_event_name: 'UserPromptSubmit', session_id: 's1' });
  await wait(IDLE + 800);
  out.resumedNoReminder = !(await shown());

  // 5. 關掉 Claude Code → 不提醒
  await runHook({ cwd: dir, hook_event_name: 'Stop', session_id: 's1', last_assistant_message: reply });
  await runHook({ cwd: dir, hook_event_name: 'SessionEnd', session_id: 's1', reason: 'exit' });
  await wait(IDLE + 800);
  out.endedNoReminder = !(await shown());

  // 6. 背景 hook 亂序：停下來先到、比它早的開始後到 → 還是要提醒
  const t = Date.now();
  await request('POST', '/activity', { event: 'stop', cwd: dir, at: t, sessionId: 's2', lastMessage: reply });
  await request('POST', '/activity', { event: 'prompt', cwd: dir, at: t - 1000, sessionId: 's2' });
  await wait(IDLE + 800);
  out.outOfOrderShown = await shown();
  // 提醒還開著時又開始做事 → 提醒自動收掉
  await request('POST', '/activity', { event: 'prompt', cwd: dir, at: Date.now(), sessionId: 's2' });
  await wait(300);
  out.cancelledOnResume = !(await shown());

  // 7. 沒有 last_assistant_message 時讀對話紀錄檔
  const tr = path.join(os.tmpdir(), `notes-transcript-${Date.now()}.jsonl`);
  fs.writeFileSync(tr, [
    { type: 'user', message: { role: 'user', content: '做吧' } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: '好，我來改。' }, { type: 'tool_use', id: 't', name: 'Edit', input: {} }] } },
    { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'ok' }] } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: '完成。\n\n## 下一步\n- 寫測試\n- 發 Release' }] } },
  ].map(e => JSON.stringify(e)).join('\n') + '\n');
  await runHook({ cwd: dir, hook_event_name: 'UserPromptSubmit', session_id: 's3' });
  await runHook({ cwd: dir, hook_event_name: 'Stop', session_id: 's3', transcript_path: tr });
  await wait(IDLE + 800);
  out.transcriptNext = await page(`document.getElementById('reminderNext').value`);
  await page(`answerReminder('later')`);
  fs.unlinkSync(tr);

  // 8. 不認得的資料夾不會新增專案
  await runHook({ cwd: 'C:/Users/user/Unknown', hook_event_name: 'Stop', session_id: 's4', last_assistant_message: reply });
  out.unknownNotAdded = !(await page(`projects.some(p => p.name === 'Unknown')`));

  // 9. 連接 Claude Code：四個事件都寫進 settings.json；只有舊版 SessionStart 的算「要重新連接」
  const file = path.join(claudeDir, 'settings.json');
  fs.writeFileSync(file, JSON.stringify({ hooks: { SessionStart: [{ matcher: 'startup|resume',
    hooks: [{ type: 'command', command: '"C:/x/接管筆記.exe" --hook', timeout: 120 }] }],
    Stop: [{ hooks: [{ type: 'command', command: 'echo mine' }] }] }, theme: 'dark' }));
  out.oldStatus = await page(`api.getSettings().hook.state`);
  out.connect = await page(`api.connectClaude()`);
  const s = JSON.parse(fs.readFileSync(file, 'utf8'));
  out.events = Object.keys(s.hooks).sort();
  out.asyncEvents = ['UserPromptSubmit', 'Stop', 'SessionEnd'].every(ev => s.hooks[ev].some(g => g.hooks.some(h => claudeSetup.isOurs(h.command) && h.async === true)));
  out.sessionStartNotAsync = s.hooks.SessionStart.every(g => g.hooks.every(h => !h.async && h.timeout === 120));
  out.keptOthers = s.theme === 'dark' && s.hooks.Stop.some(g => g.hooks.some(h => h.command === 'echo mine'));
  out.oldRemoved = !JSON.stringify(s).includes('C:/x/');
  out.newStatus = await page(`api.getSettings().hook.state`);
  await page(`api.disconnectClaude()`);
  const after = JSON.parse(fs.readFileSync(file, 'utf8'));
  out.disconnectKeepsOthers = JSON.stringify(after) === JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo mine' }] }] }, theme: 'dark' });
  return out;
};
