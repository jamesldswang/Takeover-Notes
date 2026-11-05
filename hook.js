// Claude Code 的 SessionStart hook。由 App 的「連接 Claude Code」寫進 %USERPROFILE%\.claude\settings.json
// （見 claude-setup.js），指令是「"…/接管筆記.exe" --hook」，main.js 會用 Node 模式執行這支程式。
// 開發時也可以直接 node hook.js。
//
// 流程：Claude Code 開啟專案 → 這支程式把 cwd 告訴 App → App 把專案加進清單／更新開啟時間，
// 有「下一步」就跳出提醒，等使用者按「立刻執行」或「稍後」→ 把結果交給 Claude 當作額外脈絡。
//
// 不管發生什麼錯誤都 exit 0、不輸出錯誤，絕不能卡住或弄壞 Claude Code 的啟動。
const os = require('os');
const path = require('path');
const { request, ensureApp, cliCommand } = require('./client');

function readStdin() {
  return new Promise((resolve) => {
    let s = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { s += c; });
    process.stdin.on('end', () => resolve(s));
    setTimeout(() => resolve(s), 3000);
  });
}

function buildOutput(action, p) {
  if (!p) return null;
  const notes = [
    `【接管筆記】專案「${p.name}」（${p.path}）`,
    `現在的進度：${p.progress.trim() || '（未記錄）'}`,
    `下一步：${p.next.trim() || '（未記錄）'}`,
  ];
  const howToUpdate = `使用者要你更新接管筆記（專案進度）時，在專案資料夾執行：${cliCommand()} --progress "現在進度" --next "下一步"（加 --done 代表目前的下一步已完成，會記進完成紀錄）。`;
  let context, systemMessage;
  if (action === 'run') {
    context = [...notes, '',
      '使用者剛剛在接管筆記 App 按了「立刻執行」。使用者傳來第一則訊息時（就算只是「開始」「好」或貼上的指令），請直接開始執行上面的「下一步」。',
      howToUpdate].join('\n');
    systemMessage = `📝 接管筆記：準備執行「${p.next.trim()}」。輸入「開始」或按 Ctrl+V 貼上指令即可。`;
  } else {
    context = [...notes, '',
      action === 'none' ? '（這是背景資訊，不用主動提起。）' : '使用者選擇稍後再做這個下一步，不要主動開始，除非使用者要求。',
      howToUpdate].join('\n');
  }
  const out = { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } };
  if (systemMessage) out.systemMessage = systemMessage;
  return out;
}

(async () => {
  try {
    const input = JSON.parse((await readStdin()) || '{}');
    const cwd = input.cwd || process.cwd();
    // 家目錄不是專案，不記錄
    if (path.resolve(cwd).toLowerCase() === path.resolve(os.homedir()).toLowerCase()) return;
    if (!(await ensureApp())) return;
    const res = await request('POST', '/session-start', { cwd, source: input.source }, 115 * 1000);
    const out = buildOutput(res.action, res.project);
    if (out) process.stdout.write(JSON.stringify(out));
  } catch { /* 安靜失敗 */ }
})().finally(() => setTimeout(() => process.exit(0), 50));
