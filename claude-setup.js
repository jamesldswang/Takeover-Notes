// 把接管筆記的 hook（SessionStart、UserPromptSubmit、Stop、SessionEnd）寫進（或移出）Claude Code 的使用者設定 ~/.claude/settings.json。
// 只在使用者按「連接 Claude Code」時才會執行。
//
// hook 指令直接呼叫接管筆記.exe（加 --hook），由 exe 自己用 Node 模式執行 hook.js，
// 所以另一台電腦不需要安裝 Node.js。
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOK_TIMEOUT = 120; // 秒；要大於 main.js 的 REMINDER_TIMEOUT_MS 和 hook.js 的 HTTP timeout

// 跟 Claude Code 一樣：有 CLAUDE_CONFIG_DIR 就用它（測試也靠這個，避免動到真的設定）
function settingsPath() {
  return path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'settings.json');
}

const slash = (p) => p.replace(/\\/g, '/');

// 打包版：「"…/接管筆記.exe" --hook」；原始碼版：「"…/electron.exe" "…/ProjectNotes" --hook」
function hookCommand({ execPath, appDir, packaged }) {
  return packaged ? `"${slash(execPath)}" --hook` : `"${slash(execPath)}" "${slash(appDir)}" --hook`;
}

// 是不是接管筆記（含改名前的「專案筆記」）加的 hook
function isOurs(cmd) {
  const c = String(cmd || '');
  return (/\s--hook\b/.test(c) && /(接管筆記|專案筆記|TakeoverNotes|ProjectNotes|electron\.exe)/i.test(c))
    || /(ProjectNotes|TakeoverNotes)[\\/]+hook\.js/i.test(c);
}

function read() {
  const file = settingsPath();
  if (!fs.existsSync(file)) return { file, settings: {} };
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  if (!text.trim()) return { file, settings: {} };
  return { file, settings: JSON.parse(text) }; // 解析失敗就丟錯，絕不覆蓋使用者看不懂的檔案
}

// 要掛的 hook 事件。全部用同一個指令，hook.js 依 stdin 的 hook_event_name 分辨。
//   SessionStart：開啟專案時提醒（會等使用者回答，所以 timeout 長、不能 async）
//   UserPromptSubmit／Stop／SessionEnd：只是告訴 App「開始做事／停下來／關掉了」，給 30 分鐘閒置提醒用。
//     每一輪都會觸發，用 async 在背景跑，不拖慢 Claude Code。
const EVENTS = {
  SessionStart: { matcher: 'startup|resume', timeout: HOOK_TIMEOUT },
  UserPromptSubmit: { timeout: 15, async: true },
  Stop: { timeout: 15, async: true },
  SessionEnd: { timeout: 15, async: true },
};

const commandsOf = (settings, event) => ((settings.hooks && settings.hooks[event]) || [])
  .flatMap((g) => (g.hooks || []).map((h) => h.command)).filter(isOurs);
const ourCommands = (settings) => Object.keys(EVENTS).flatMap((ev) => commandsOf(settings, ev));

// 'connected'：每個事件都已連接且指向目前這個 exe；'outdated'：有接管筆記的 hook 但路徑不對
// （例如搬了資料夾、換了版本）或少了事件（舊版只有 SessionStart）；'missing'：沒有；'error'：settings.json 讀不懂
function status(cmd) {
  try {
    const { settings } = read();
    const mine = ourCommands(settings);
    if (!mine.length) return { state: 'missing', file: settingsPath() };
    const complete = Object.keys(EVENTS).every((ev) => commandsOf(settings, ev).includes(cmd));
    return { state: complete ? 'connected' : 'outdated', file: settingsPath(), current: [...new Set(mine)] };
  } catch (e) {
    return { state: 'error', file: settingsPath(), error: e.message };
  }
}

// 移除舊的接管筆記 hook（保留使用者其他的 hook），沒剩東西的群組也一起拿掉
function stripOurs(settings) {
  if (!settings.hooks) return;
  for (const ev of Object.keys(EVENTS)) {
    if (!Array.isArray(settings.hooks[ev])) continue;
    settings.hooks[ev] = settings.hooks[ev]
      .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !isOurs(h.command)) }))
      .filter((g) => g.hooks.length);
    if (!settings.hooks[ev].length) delete settings.hooks[ev];
  }
  if (!Object.keys(settings.hooks).length) delete settings.hooks;
}

function write(file, settings) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) fs.copyFileSync(file, file + '.takeover-notes.bak'); // 改之前留一份備份
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

function install(cmd) {
  const { file, settings } = read();
  stripOurs(settings);
  settings.hooks = settings.hooks || {};
  for (const [ev, { matcher, ...opts }] of Object.entries(EVENTS)) {
    settings.hooks[ev] = settings.hooks[ev] || [];
    settings.hooks[ev].push({ ...(matcher ? { matcher } : {}), hooks: [{ type: 'command', command: cmd, ...opts }] });
  }
  write(file, settings);
}

function uninstall() {
  const { file, settings } = read();
  if (!ourCommands(settings).length) return;
  stripOurs(settings);
  write(file, settings);
}

module.exports = { settingsPath, hookCommand, isOurs, status, install, uninstall, HOOK_TIMEOUT, EVENTS };
