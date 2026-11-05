// store.js 的純邏輯測試（不用開 App）：node tools/store-test.js
// 重點是「換電腦」：同一個專案在兩台電腦路徑不同、兩邊都改過，合併後要對、而且合併順序不影響結果。
const assert = require('assert');
const s = require('../store');

const H1 = 'C:/Users/user', H2 = 'D:/Home/james';
let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('ok  ' + name); };

t('normRemote 統一 https／ssh 寫法', () => {
  assert.strictEqual(s.normRemote('https://github.com/James/Clock.git'), 'github.com/james/clock');
  assert.strictEqual(s.normRemote('git@github.com:James/Clock.git'), 'github.com/james/clock');
  assert.strictEqual(s.normRemote('ssh://git@github.com/James/Clock'), 'github.com/james/clock');
});

t('子資料夾算同一個專案', () => {
  const d = s.normalize({});
  const p = s.touch(d, H1 + '/ClockApp', { home: H1 });
  assert.strictEqual(s.findByPath(d, H1 + '/ClockApp/src/x', { home: H1 }), p);
});

t('另一台電腦：用 git remote 認出同一個專案並記下新路徑', () => {
  const d = s.normalize({});
  const p = s.touch(d, H1 + '/ClockApp', { home: H1, remote: 'https://github.com/j/Clock.git' });
  const q = s.touch(d, 'E:/work/clock', { home: H2, remote: 'git@github.com:j/Clock.git' });
  assert.strictEqual(q, p);
  assert.strictEqual(d.projects.length, 1);
  assert.ok(p.paths.length === 2 && s.normPath(p.path) === s.normPath('E:/work/clock'));
});

t('另一台電腦：沒有 remote 時用「家目錄底下的相對路徑」認', () => {
  const d = s.normalize({});
  const p = s.touch(d, H1 + '/ProjectNotes', { home: H1 });
  assert.strictEqual(s.touch(d, H2 + '/ProjectNotes', { home: H2 }), p);
  assert.strictEqual(d.projects.length, 1);
  assert.notStrictEqual(s.touch(d, H2 + '/Other', { home: H2 }), p);
});

t('合併：各自新增的專案都留下，同一個專案取比較新的內容、完成紀錄取聯集', () => {
  const a = s.normalize({ projects: [
    { id: 'a1', path: H1 + '/ClockApp', remote: 'github.com/j/clock', progress: '舊進度', next: 'A', updatedAt: '2026-01-01T00:00:00Z', history: [{ at: '2025-12-01T00:00:00Z', text: '做完 X' }] },
    { id: 'a2', path: H1 + '/OnlyA' },
  ] });
  const b = s.normalize({ projects: [
    { id: 'b1', path: 'E:/clock', remote: 'github.com/j/clock', progress: '新進度', next: 'B', updatedAt: '2026-02-01T00:00:00Z', history: [{ at: '2026-01-15T00:00:00Z', text: '做完 Y' }] },
    { id: 'b2', path: 'E:/OnlyB' },
  ] });
  const m = s.merge(a, b);
  assert.strictEqual(m.projects.length, 3);
  const c = m.projects.find((p) => p.remote === 'github.com/j/clock');
  assert.strictEqual(c.progress, '新進度');
  assert.deepStrictEqual(c.history.map((h) => h.text), ['做完 Y', '做完 X']);
  assert.strictEqual(c.paths.length, 2);
  assert.strictEqual(s.canon(s.merge(a, b)), s.canon(s.merge(b, a)), '合併順序不能影響結果');
  assert.strictEqual(s.canon(s.merge(m, m)), s.canon(m), '合併自己不能改變內容');
  assert.strictEqual(s.canon(s.merge(m, a)), s.canon(m), '舊版本合進來不能蓋掉新內容');
});

t('合併：刪除會同步；刪除後在另一台改過則保留', () => {
  const base = s.normalize({ projects: [{ id: 'x', path: H1 + '/X', updatedAt: '2026-01-01T00:00:00Z' }] });
  const a = JSON.parse(JSON.stringify(base));
  s.remove(a, 'x');
  assert.strictEqual(s.merge(a, base).projects.length, 0);
  assert.strictEqual(s.merge(base, a).projects.length, 0);
  const b = JSON.parse(JSON.stringify(base));
  b.projects[0].updatedAt = '2999-01-01T00:00:00Z';
  assert.strictEqual(s.merge(a, b).projects.length, 1);
});

t('update 只有內容真的變了才更新 updatedAt', () => {
  const d = s.normalize({ projects: [{ id: 'x', path: H1 + '/X', next: 'A', updatedAt: '2026-01-01T00:00:00Z' }] });
  assert.strictEqual(s.update(d, 'x', { next: 'A' }), false);
  assert.strictEqual(d.projects[0].updatedAt, '2026-01-01T00:00:00Z');
  assert.strictEqual(s.update(d, 'x', { next: 'B', path: 'C:/hack' }), true);
  assert.notStrictEqual(d.projects[0].updatedAt, '2026-01-01T00:00:00Z');
  assert.ok(!d.projects[0].paths.includes('C:/hack'), 'path 不能從畫面改');
});

t('舊版（專案筆記 1.0.0）的資料可以直接讀', () => {
  const old = { projects: [{ id: 'o', path: 'C:\\Users\\user\\ClockApp', name: '時鐘', progress: 'v1.1.0', next: '', remind: true, history: [], createdAt: '2026-11-05T05:00:00Z', lastOpenedAt: null }] };
  const n = s.normalize(old);
  assert.strictEqual(n.projects[0].name, '時鐘');
  assert.deepStrictEqual(n.projects[0].paths, ['C:\\Users\\user\\ClockApp']);
  assert.deepStrictEqual(n.deleted, []);
});

t('重複：舊專案沒記 remote，另一台電腦又新增了一份 → 補上 remote 後併成一個，名稱保留原本的', () => {
  const d = s.normalize({ projects: [
    { id: 'a1', name: '時鐘', path: H1 + '/ClockApp', progress: 'v1.1.0', next: '加鬧鐘', updatedAt: '2026-11-05T05:00:00Z' },
    { id: 'b2', name: 'Clock', path: 'D:/Personal_Git/Clock', remote: 'github.com/j/clock', updatedAt: '2026-11-05T09:00:00Z' },
  ] });
  const before = s.canon(d);
  assert.strictEqual(s.fillRemotes(d, (p) => (p.id === 'a1' ? 'https://github.com/j/Clock.git' : '')), true);
  assert.strictEqual(d.projects.length, 1);
  const p = d.projects[0];
  assert.strictEqual(p.id, 'a1');
  assert.strictEqual(p.name, '時鐘');
  assert.strictEqual(p.next, '加鬧鐘');
  assert.strictEqual(p.paths.length, 2);
  assert.ok(d.deleted.some((x) => x.id === 'b2'), '併掉的 id 要留刪除紀錄');
  // 舊版 App 那邊（還有兩份）合併進來，結果不變；合併順序不影響
  const old = s.normalize(JSON.parse(before));
  assert.strictEqual(s.canon(s.merge(d, old)), s.canon(d));
  assert.strictEqual(s.canon(s.merge(old, d)), s.canon(d));
  assert.strictEqual(s.fillRemotes(d, () => 'x'), false, '已經有 remote 就不再查');
});

t('重複：開啟時才查到 remote，也會併成一個', () => {
  const d = s.normalize({ projects: [
    { id: 'a1', name: '時鐘', path: H1 + '/ClockApp', next: '加鬧鐘', updatedAt: '2026-11-05T05:00:00Z' },
    { id: 'b2', name: 'Clock', path: 'D:/Personal_Git/Clock', remote: 'github.com/j/clock', updatedAt: '2026-11-05T09:00:00Z' },
  ] });
  const p = s.touch(d, H1 + '/ClockApp', { home: H1, remote: 'git@github.com:j/Clock.git' });
  assert.strictEqual(d.projects.length, 1);
  assert.strictEqual(p, d.projects[0]);
  assert.strictEqual(p.name, '時鐘');
  assert.ok(p.lastOpenedAt);
});

console.log(`\n${pass} 個測試全部通過`);
