// 專案筆記的資料操作（純函式，不碰 Electron，main.js 和測試都可以用）
//
// 資料格式：{ projects: [Project] }
// Project = { id, path, name, progress, next, remind, history: [{ at, text }],
//             createdAt, lastOpenedAt }   // 時間都是 ISO 字串
const path = require('path');

// Windows 路徑不分大小寫：統一成小寫、反斜線、去掉結尾的斜線，用來比對
function normPath(p) {
  return path.resolve(String(p)).replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// 載入舊資料時補上缺少的欄位
function normalizeProject(p) {
  const now = new Date().toISOString();
  return {
    id: String(p.id || newId()),
    path: String(p.path || ''),
    name: String(p.name || (p.path ? path.basename(String(p.path)) : '未命名專案')),
    progress: String(p.progress || ''),
    next: String(p.next || ''),
    remind: p.remind !== false,
    history: Array.isArray(p.history) ? p.history.filter((h) => h && h.text).map((h) => ({ at: String(h.at || now), text: String(h.text) })) : [],
    createdAt: String(p.createdAt || now),
    lastOpenedAt: p.lastOpenedAt ? String(p.lastOpenedAt) : null,
  };
}

function normalize(d) {
  const projects = Array.isArray(d && d.projects) ? d.projects.filter((p) => p && p.path).map(normalizeProject) : [];
  return { projects };
}

// 找出 cwd 所屬的專案：路徑相同，或 cwd 在專案資料夾底下（取最深的那個）
function findByPath(data, cwd) {
  if (!cwd) return null;
  const c = normPath(cwd);
  let best = null;
  for (const p of data.projects) {
    const n = normPath(p.path);
    if ((c === n || c.startsWith(n + '\\')) && (!best || n.length > normPath(best.path).length)) best = p;
  }
  return best;
}

// 開啟專案：找不到就新增；open 為 true 時更新「上次開啟」時間
function touch(data, cwd, { open = true } = {}) {
  let p = findByPath(data, cwd);
  if (!p) {
    p = normalizeProject({ path: path.resolve(String(cwd)) });
    data.projects.push(p);
  }
  if (open) p.lastOpenedAt = new Date().toISOString();
  return p;
}

const EDITABLE = ['name', 'path', 'progress', 'next', 'remind'];

function update(data, id, patch) {
  const p = data.projects.find((x) => x.id === id);
  if (!p || !patch) return false;
  for (const k of EDITABLE) {
    if (!(k in patch)) continue;
    p[k] = k === 'remind' ? !!patch[k] : String(patch[k]);
  }
  return true;
}

// 「下一步」完成：移到完成紀錄（最新的在最前面），清空下一步
function completeNext(p) {
  const text = p.next.trim();
  if (!text) return false;
  p.history.unshift({ at: new Date().toISOString(), text });
  p.next = '';
  return true;
}

function remove(data, id) {
  const before = data.projects.length;
  data.projects = data.projects.filter((x) => x.id !== id);
  return data.projects.length !== before;
}

module.exports = { normPath, normalize, normalizeProject, findByPath, touch, update, completeNext, remove };
