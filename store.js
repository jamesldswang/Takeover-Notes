// 接管筆記的資料操作（純函式，不碰 Electron，main.js、hook.js 和測試都可以用）
//
// 資料格式：{ projects: [Project], deleted: [{ id, at }] }
// Project = {
//   id, name, path,            // path：最近一次使用的路徑
//   paths: [],                 // 這個專案在各台電腦用過的所有路徑
//   homePaths: [],             // 相對於該台電腦家目錄的路徑（例如 'ClockApp'），換電腦時用來認專案
//   remote: '',                // git origin（正規化成 github.com/owner/repo），換電腦時用來認專案
//   progress, next, remind, history: [{ at, text }],
//   createdAt, updatedAt, lastOpenedAt   // ISO 字串；updatedAt 只在內容改變時更新，合併時用
// }
// deleted：刪除紀錄（墓碑），兩台電腦合併時才不會把刪掉的專案又加回來。
const os = require('os');
const path = require('path');

const nowIso = () => new Date().toISOString();

// Windows 路徑不分大小寫：統一成小寫、反斜線、去掉結尾的斜線，用來比對
function normPath(p) {
  return path.resolve(String(p)).replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
}

// 相對於家目錄的路徑（不在家目錄底下就回傳 ''）
function homeRel(p, home = os.homedir()) {
  const n = normPath(p), h = normPath(home);
  return n.startsWith(h + '\\') ? n.slice(h.length + 1) : '';
}

// git remote 正規化：https://github.com/A/B.git、git@github.com:A/B 都變成 github.com/a/b
function normRemote(url) {
  if (!url) return '';
  let s = String(url).trim().toLowerCase();
  s = s.replace(/^[a-z+]+:\/\//, '').replace(/^[^@/]+@/, '').replace(/:(?!\d)/, '/');
  return s.replace(/\.git$/, '').replace(/\/+$/, '');
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const uniq = (arr) => [...new Set(arr.filter(Boolean))];
const uniqPaths = (arr) => {
  const seen = new Set();
  return arr.filter((p) => p && !seen.has(normPath(p)) && seen.add(normPath(p)));
};

// 載入舊資料時補上缺少的欄位
function normalizeProject(p) {
  const now = nowIso();
  const mainPath = String(p.path || (p.paths && p.paths[0]) || '');
  const paths = uniqPaths([mainPath, ...(Array.isArray(p.paths) ? p.paths.map(String) : [])])
    .sort((x, y) => normPath(x).localeCompare(normPath(y)));
  return {
    id: String(p.id || newId()),
    name: String(p.name || (mainPath ? path.basename(mainPath) : '未命名專案')),
    path: mainPath,
    paths,
    homePaths: uniq([...(Array.isArray(p.homePaths) ? p.homePaths.map(String) : []), ...paths.map((x) => homeRel(x))]).sort(),
    remote: normRemote(p.remote),
    progress: String(p.progress || ''),
    next: String(p.next || ''),
    remind: p.remind !== false,
    history: Array.isArray(p.history)
      ? p.history.filter((h) => h && h.text).map((h) => ({ at: String(h.at || now), text: String(h.text) }))
        .sort((x, y) => y.at.localeCompare(x.at) || x.text.localeCompare(y.text))
      : [],
    createdAt: String(p.createdAt || now),
    updatedAt: String(p.updatedAt || p.createdAt || now),
    lastOpenedAt: p.lastOpenedAt ? String(p.lastOpenedAt) : null,
  };
}

// 專案依 id、刪除紀錄依 id 排序，路徑和完成紀錄也排好，同樣的內容永遠產生同樣的 JSON
function normalize(d) {
  const byId = (x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);
  const all = Array.isArray(d && d.projects) ? d.projects.filter((p) => p && (p.path || (p.paths && p.paths.length))).map(normalizeProject).sort(byId) : [];
  const deleted = Array.isArray(d && d.deleted) ? d.deleted.filter((x) => x && x.id).map((x) => ({ id: String(x.id), at: String(x.at || nowIso()) })) : [];
  // 同一份資料裡重複的專案（同一個 git remote 或共用路徑，例如另一台電腦先新增了、之後才認出是同一個）併成一個
  const projects = [];
  for (const q of all) {
    const i = projects.findIndex((p) => p.id === q.id || (p.remote && p.remote === q.remote) || sharesPath(p, q));
    if (i < 0) { projects.push(q); continue; }
    const c = combine(projects[i], q);
    // 被併掉的 id 留刪除紀錄：還沒更新的舊版 App 合併時才不會把它加回來
    for (const x of [projects[i], q]) if (x.id !== c.id) deleted.push({ id: x.id, at: x.updatedAt });
    projects[i] = normalizeProject(c);
  }
  const latest = new Map();
  for (const x of deleted) if (!latest.has(x.id) || latest.get(x.id) < x.at) latest.set(x.id, x.at);
  return { projects: projects.sort(byId), deleted: [...latest].map(([id, at]) => ({ id, at })).sort(byId) };
}

const sharesPath = (p, q) => p.paths.some((x) => q.paths.some((y) => normPath(x) === normPath(y)));

// 把同一個專案的兩份合成一份（結果跟參數順序無關）。
// 同一個 id（兩台電腦各改一份）：內容取 updatedAt 比較新的。
// 不同 id（重複新增的）：保留比較早的 id 和名稱（使用者取的名字），進度／下一步取比較新且有內容的。
function combine(p, q) {
  const newer = q.updatedAt !== p.updatedAt ? (q.updatedAt > p.updatedAt ? q : p)
    : (JSON.stringify(q) > JSON.stringify(p) ? q : p);
  const older = newer === p ? q : p;
  const first = p.id < q.id ? p : q;
  const seen = new Set();
  const out = {
    ...newer,
    id: first.id,
    paths: [...p.paths, ...q.paths],
    homePaths: [...p.homePaths, ...q.homePaths],
    remote: [p.remote, q.remote].filter(Boolean).sort()[0] || '',
    history: [...p.history, ...q.history]
      .filter((h) => { const k = h.at + '|' + h.text; return !seen.has(k) && seen.add(k); }),
    createdAt: p.createdAt < q.createdAt ? p.createdAt : q.createdAt,
    lastOpenedAt: [p.lastOpenedAt, q.lastOpenedAt].filter(Boolean).sort().pop() || null,
  };
  if (p.id !== q.id) {
    out.name = first.name;
    out.remind = first.remind;
    out.progress = newer.progress || older.progress;
    out.next = newer.next || older.next;
  }
  return out;
}

// 找出 cwd 所屬的專案：
//   1. 路徑相同，或 cwd 在專案資料夾底下（取最深的那個）
//   2. git remote 相同（另一台電腦 clone 的同一個 repo）
//   3. 相對於家目錄的路徑相同（例如兩台電腦都是 ~/ClockApp）
function findByPath(data, cwd, { remote = '', home } = {}) {
  if (!cwd) return null;
  const c = normPath(cwd);
  let best = null, bestLen = -1;
  for (const p of data.projects) {
    for (const x of p.paths) {
      const n = normPath(x);
      if ((c === n || c.startsWith(n + '\\')) && n.length > bestLen) { best = p; bestLen = n.length; }
    }
  }
  if (best) return best;
  const r = normRemote(remote);
  if (r) {
    const byRemote = data.projects.find((p) => p.remote === r);
    if (byRemote) return byRemote;
  }
  const rel = homeRel(cwd, home);
  if (rel) return data.projects.find((p) => p.homePaths.includes(rel)) || null;
  return null;
}

// 記下這台電腦上的路徑（換電腦後第一次開啟時）
function addPath(p, cwd, home) {
  const abs = path.resolve(String(cwd));
  p.path = abs;
  p.paths = uniqPaths([abs, ...p.paths]);
  p.homePaths = uniq([...p.homePaths, homeRel(abs, home)]);
}

// 開啟專案：找不到就新增；open 為 true 時更新「上次開啟」時間。
// 用 remote／家目錄路徑認到的專案，會把這次的 cwd 記成新路徑。
function touch(data, cwd, { open = true, remote = '', home } = {}) {
  let p = findByPath(data, cwd, { remote, home });
  if (!p) {
    p = normalizeProject({ path: path.resolve(String(cwd)) });
    data.projects.push(p);
  } else if (!p.paths.some((x) => { const n = normPath(x), c = normPath(cwd); return c === n || c.startsWith(n + '\\'); })) {
    addPath(p, cwd, home);
  }
  if (remote && !p.remote) {
    p.remote = normRemote(remote);
    if (data.projects.some((x) => x !== p && x.remote === p.remote)) p = fold(data, p);
  }
  if (open) p.lastOpenedAt = nowIso();
  return p;
}

// 重新整理 data（併掉重複的專案），回傳 p 併進去之後的那個專案
function fold(data, p) {
  const n = normalize(data);
  data.projects = n.projects;
  data.deleted = n.deleted;
  return data.projects.find((x) => x.remote && x.remote === p.remote) || p;
}

// 補上還沒記錄的 git remote（舊資料、或在加入 remote 功能之前建立的專案）。
// remoteOf(p) 回傳這台電腦上查得到的 remote；有補到就順便併掉重複的專案。回傳是否有改變。
function fillRemotes(data, remoteOf) {
  let changed = false;
  for (const p of data.projects) {
    if (p.remote) continue;
    const r = normRemote(remoteOf(p));
    if (r) { p.remote = r; changed = true; }
  }
  if (changed) { const n = normalize(data); data.projects = n.projects; data.deleted = n.deleted; }
  return changed;
}

const EDITABLE = ['name', 'progress', 'next', 'remind'];

function update(data, id, patch) {
  const p = data.projects.find((x) => x.id === id);
  if (!p || !patch) return false;
  let changed = false;
  for (const k of EDITABLE) {
    if (!(k in patch)) continue;
    const v = k === 'remind' ? !!patch[k] : String(patch[k]);
    if (p[k] !== v) { p[k] = v; changed = true; }
  }
  if (changed) p.updatedAt = nowIso();
  return changed;
}

// 「下一步」完成：移到完成紀錄（最新的在最前面），清空下一步
function completeNext(p) {
  const text = p.next.trim();
  if (!text) return false;
  p.history.unshift({ at: nowIso(), text });
  p.next = '';
  p.updatedAt = nowIso();
  return true;
}

function remove(data, id) {
  const before = data.projects.length;
  data.projects = data.projects.filter((x) => x.id !== id);
  if (data.projects.length === before) return false;
  data.deleted = [...(data.deleted || []).filter((x) => x.id !== id), { id, at: nowIso() }];
  return true;
}

// 兩份資料合併（同步資料夾被另一台電腦改過、或匯入時用）。
// 同一個專案：id 相同，或 remote 相同，或有共同路徑／家目錄路徑。
// 內容取 updatedAt 比較新的那份；路徑、完成紀錄取聯集；lastOpenedAt 取較新的。
function merge(a, b) {
  const A = normalize(a), B = normalize(b);
  const deleted = new Map();
  for (const d of [...A.deleted, ...B.deleted]) if (!deleted.has(d.id) || deleted.get(d.id) < d.at) deleted.set(d.id, d.at);

  // 結果不能跟合併順序有關（merge(a,b) 和 merge(b,a) 要一樣），
  // 否則兩台電腦會互相覺得「對方的版本不一樣」，一直改寫同步資料夾裡的檔案。
  const out = A.projects.map((p) => ({ ...p }));
  const same = (p, q) => p.id === q.id || (p.remote && p.remote === q.remote)
    || sharesPath(p, q)
    || p.homePaths.some((x) => x && q.homePaths.includes(x));

  for (const q of B.projects) {
    const i = out.findIndex((p) => same(p, q));
    if (i < 0) { out.push({ ...q }); continue; }
    out[i] = combine(out[i], q);
  }
  // 刪除紀錄比最後修改還新的專案才算刪除
  const projects = out.filter((p) => !(deleted.has(p.id) && deleted.get(p.id) >= p.updatedAt));
  // normalize 會再併一次（例如 A 裡原本就有兩份、B 的一份把它們連起來）
  return normalize({ projects, deleted: [...deleted].map(([id, at]) => ({ id, at })) });
}

// 用來比較兩份資料內容是否相同（不管順序）
function canon(d) {
  const n = normalize(d);
  return JSON.stringify({ projects: n.projects, deleted: n.deleted });
}

// 從 Claude 最後一則回覆裡找「建議下一步」那一段（閒置提醒時預先填進下一步）。找不到回傳 ''。
//   建議下一步           ← 標題（含「下一步」的短行，可以是 ## 標題或「下一步：xxx」）
//                        ← 中間的空行跳過
//   1. 實際錄一段…        ← 收集到空行後面接的不是清單項目、或遇到下一個標題為止
const LIST_ITEM = /^\s*(?:[-*•]\s+|\d+[.)、]\s*|[①-⑳])/;
function suggestNext(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const isHeading = (l) => /下一步|next steps?/i.test(l) && !LIST_ITEM.test(l)
    && (/^\s*#/.test(l) || /^\s*\**[^。，,.]{0,20}(下一步|next steps?)[^。]{0,6}[：:]?\**\s*$/i.test(l) || /(下一步|next steps?)\**\s*[：:]/i.test(l));
  let h = -1;
  for (let i = lines.length - 1; i >= 0; i--) if (isHeading(lines[i])) { h = i; break; }
  if (h < 0) return '';
  const strip = (l) => l.replace(/\*\*/g, '').trimEnd();
  const out = [];
  const inline = strip(lines[h]).replace(/^.*?(下一步|next steps?)\s*[：:]\s*/i, '');
  if (inline !== strip(lines[h]) && inline.trim()) out.push(inline.trim());
  for (let i = h + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*#/.test(l) || /^\s*(---|___|\*\*\*)\s*$/.test(l)) break;
    if (!l.trim()) {
      if (!out.length) continue;
      const nextLine = lines.slice(i + 1).find((x) => x.trim());
      if (nextLine && LIST_ITEM.test(nextLine)) continue; // 清單項目之間的空行
      break;
    }
    out.push(strip(l));
  }
  return out.join('\n').trim().slice(0, 2000);
}

module.exports = { normPath, homeRel, normRemote, normalize, normalizeProject, findByPath, touch, addPath, fillRemotes, update, completeNext, remove, merge, canon, suggestNext };
