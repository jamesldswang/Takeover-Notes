// 產生 GitHub Release 的 JSON 內容（給 tools/release.sh 用）。
// 用法：node tools/release-body.js <輸出檔>
// 說明文字取自 README「版本紀錄」裡目前版本的段落。
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const v = require(path.join(root, 'package.json')).version;
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8').replace(/\r/g, '');

const lines = readme.split('\n');
const start = lines.findIndex((l) => l.startsWith(`### ${v}`));
if (start < 0) { console.error(`README 的版本紀錄裡找不到 ### ${v}`); process.exit(1); }
let end = lines.findIndex((l, i) => i > start && /^#{1,3} /.test(l));
if (end < 0) end = lines.length;
const notes = lines.slice(start + 1, end).join('\n').trim();

const body = {
  tag_name: `v${v}`,
  target_commitish: 'main',
  name: `接管筆記 v${v}`,
  body: [
    '## 下載與安裝',
    '',
    `1. 下載下方的 \`TakeoverNotes-${v}-win-x64.zip\`，解壓縮到固定的位置（例如 \`C:\\Tools\\TakeoverNotes\`）。`,
    '2. 雙擊 `接管筆記.exe`，程式會常駐在系統匣。',
    '3. 按 **Ctrl+Alt+N**，在黃色提示上按 **連接**，Claude Code 開啟專案時就會提醒你下一步。',
    '',
    '系統需求：Windows 10／11 64 位元、已安裝 Claude Code，**不需要安裝 Node.js**。如果出現「Windows 已保護您的電腦」，點「其他資訊」→「仍要執行」。',
    '',
    '**換電腦接續工作**：兩台電腦都在 ⚙ 設定把資料位置選到 OneDrive／Dropbox 的同一個資料夾，或用「匯出／匯入」搬過去。詳見 [README](https://github.com/jamesldswang/Takeover-Notes#在另一台電腦接續工作)。',
    '',
    '## 變更',
    '',
    notes,
  ].join('\n'),
};

fs.writeFileSync(process.argv[2], JSON.stringify(body), 'utf8');
