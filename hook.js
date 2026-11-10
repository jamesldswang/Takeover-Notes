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
  const howToUpdate = [
    `【自動更新接管筆記】每次做完一段工作、要停下來等使用者之前，不用問使用者，直接在專案資料夾執行：${cliCommand()} --progress "現在進度" --next "下一步"`,
    '- 「現在進度」用一兩句話寫做到哪裡（例如版本、完成了什麼、還沒 commit／還沒測試的部分）。',
    '- 「下一步」寫你建議的下一步（有好幾步就用 1. 2. 3. 分行）。回覆裡有「建議下一步」的話，內容要一致。',
    '- 筆記上的「下一步」已經做完時加 --done，它會記進完成紀錄。',
    '- 只是回答問題、沒有改變進度時不用更新。更新後在回覆最後用一句話告訴使用者「已更新接管筆記」。',
  ].join('\n');
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

// Claude 這一輪最後說的話（Stop 事件用；從中找「建議下一步」）。
// 新版 Claude Code 的 stdin 直接有 last_assistant_message；沒有就讀對話紀錄檔（JSONL）的最後一段。
function lastAssistantText(input) {
  if (typeof input.last_assistant_message === 'string') return input.last_assistant_message;
  try {
    const file = input.transcript_path;
    if (!file) return '';
    const fs = require('fs');
    const size = fs.statSync(file).size, len = Math.min(size, 512 * 1024);
    const buf = Buffer.alloc(len);
    const fd = fs.openSync(file, 'r');
    try { fs.readSync(fd, buf, 0, len, size - len); } finally { fs.closeSync(fd); }
    const lines = buf.toString('utf8').split('\n').reverse();
    const texts = [];
    for (const line of lines) {
      let e; try { e = JSON.parse(line); } catch { continue; }
      if (e.type === 'user') break;
      if (e.type !== 'assistant' || !e.message || !Array.isArray(e.message.content)) continue;
      const blocks = e.message.content;
      if (blocks.some((b) => b.type === 'tool_use')) break; // 再往前是做事的過程，不是最後的回覆
      const t = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
      if (t) texts.unshift(t);
    }
    return texts.join('\n');
  } catch { return ''; }
}

// UserPromptSubmit／Stop／SessionEnd：告訴 App 專案開始做事、停下來或關掉了（30 分鐘閒置提醒用）。
// 在背景（async hook）執行，App 沒開就算了，不要為此啟動 App；stdout 不輸出任何東西
// （UserPromptSubmit 的 stdout 會被加進對話）。
const ACTIVITY = { UserPromptSubmit: 'prompt', Stop: 'stop', SessionEnd: 'end' };
async function reportActivity(input, cwd, at) {
  const body = { event: ACTIVITY[input.hook_event_name], cwd, at, sessionId: input.session_id || '' };
  if (body.event === 'stop') body.lastMessage = lastAssistantText(input).slice(-20000);
  await request('POST', '/activity', body, 5000);
}

(async () => {
  try {
    const at = Date.now(); // 背景執行可能亂序到達，App 用這個時間排先後
    const input = JSON.parse((await readStdin()) || '{}');
    const cwd = input.cwd || process.cwd();
    // 家目錄不是專案，不記錄
    if (path.resolve(cwd).toLowerCase() === path.resolve(os.homedir()).toLowerCase()) return;
    if (ACTIVITY[input.hook_event_name]) return await reportActivity(input, cwd, at);
    if (!(await ensureApp())) return;
    const res = await request('POST', '/session-start', { cwd, source: input.source }, 115 * 1000);
    const out = buildOutput(res.action, res.project);
    if (out) process.stdout.write(JSON.stringify(out));
  } catch { /* 安靜失敗 */ }
})().finally(() => setTimeout(() => process.exit(0), 50));
