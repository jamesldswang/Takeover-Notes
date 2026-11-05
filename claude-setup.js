// 把接管筆記的 SessionStart hook 寫進（或移出）Claude Code 的使用者設定 ~/.claude/settings.json。
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

function ourCommands(settings) {
  const groups = (settings.hooks && settings.hooks.SessionStart) || [];
  return groups.flatMap((g) => (g.hooks || []).map((h) => h.command)).filter(isOurs);
}

// 'connected'：已連接且指向目前這個 exe；'outdated'：有接管筆記的 hook 但路徑不對（例如搬了資料夾）；
// 'missing'：沒有；'error'：settings.json 讀不懂
function status(cmd) {
  try {
    const mine = ourCommands(read().settings);
    if (!mine.length) return { state: 'missing', file: settingsPath() };
    return { state: mine.includes(cmd) ? 'connected' : 'outdated', file: settingsPath(), current: mine };
  } catch (e) {
    return { state: 'error', file: settingsPath(), error: e.message };
  }
}

// 移除舊的接管筆記 hook（保留使用者其他的 hook），沒剩東西的群組也一起拿掉
function stripOurs(settings) {
  if (!settings.hooks || !Array.isArray(settings.hooks.SessionStart)) return;
  settings.hooks.SessionStart = settings.hooks.SessionStart
    .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !isOurs(h.command)) }))
    .filter((g) => g.hooks.length);
  if (!settings.hooks.SessionStart.length) delete settings.hooks.SessionStart;
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
  settings.hooks.SessionStart = settings.hooks.SessionStart || [];
  settings.hooks.SessionStart.push({
    matcher: 'startup|resume',
    hooks: [{ type: 'command', command: cmd, timeout: HOOK_TIMEOUT }],
  });
  write(file, settings);
}

function uninstall() {
  const { file, settings } = read();
  if (!ourCommands(settings).length) return;
  stripOurs(settings);
  write(file, settings);
}

module.exports = { settingsPath, hookCommand, isOurs, status, install, uninstall, HOOK_TIMEOUT };
