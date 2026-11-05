// 命令列更新專案筆記（Claude Code 裡可以直接叫它記錄進度）。
//
//   node cli.js                                   顯示目前資料夾所屬專案的筆記
//   node cli.js --progress "登入頁完成" --next "串接 API"
//   node cli.js --done                            目前的下一步完成，移到完成紀錄
//   node cli.js --done --next "寫測試"            完成並設定新的下一步
//   node cli.js --cwd C:\Users\user\MyApp ...     指定專案資料夾（預設是目前資料夾）
//
// App 沒開的話會自動啟動。
const { request, ensureApp } = require('./client');

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--done') opts.done = true;
    else if (['--progress', '--next', '--name', '--cwd'].includes(a)) {
      if (i + 1 >= argv.length) throw new Error(`${a} 後面要接內容`);
      opts[a.slice(2)] = argv[++i];
    } else if (a === '-h' || a === '--help') opts.help = true;
    else throw new Error(`看不懂的參數：${a}`);
  }
  return opts;
}

function show(p) {
  if (!p) return console.log('這個資料夾還沒有專案筆記。');
  console.log(`專案：${p.name}\n路徑：${p.path}\n現在的進度：${p.progress || '（未記錄）'}\n下一步：${p.next || '（未記錄）'}`);
  if (p.history.length) console.log('完成紀錄：\n' + p.history.slice(0, 5).map((h) => `  ${h.at.slice(0, 10)} ✓ ${h.text}`).join('\n'));
}

(async () => {
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(2); }
  if (opts.help) { console.log(require('fs').readFileSync(__filename, 'utf8').split('\n').slice(0, 9).join('\n')); return; }
  if (!(await ensureApp())) { console.error('專案筆記 App 沒有在執行，也無法自動啟動。'); process.exit(1); }
  const cwd = opts.cwd || process.cwd();
  const isUpdate = opts.done || ['progress', 'next', 'name'].some((k) => k in opts);
  const res = isUpdate
    ? await request('POST', '/update', { cwd, progress: opts.progress, next: opts.next, name: opts.name, done: opts.done })
    : await request('POST', '/get', { cwd });
  if (isUpdate) console.log('已更新。');
  show(res.project);
})().catch((e) => { console.error('失敗：' + e.message); process.exit(1); });
