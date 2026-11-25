// 資料夾改名、GitHub 改名後還認得專案：
//   ./node_modules/electron/dist/electron.exe tools/run-in-app.js tools/relocate-test.js
const fs = require('fs');
const os = require('os');
const path = require('path');

const gitInit = (dir, url) => {
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.git', 'config'), `[core]\n\tbare = false\n[remote "origin"]\n\turl = ${url}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`);
};

module.exports = async ({ page, runCli }) => {
  const main = require('../main.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-relocate-'));
  const oldDir = path.join(root, 'bead-grid');
  const newDir = path.join(root, 'Perler-Beads');
  const other = path.join(root, 'Other');
  gitInit(oldDir, 'https://github.com/j/perler-beads.git');
  gitInit(other, 'https://github.com/j/other.git');
  await runCli(['--cwd', oldDir, '--next', '換顏色']);
  await runCli(['--cwd', other, '--next', '別的']);
  const find = () => main.getData().projects.find((p) => p.next === '換顏色');

  // 1. 資料夾改名 → 掃描上一層資料夾接上
  fs.renameSync(oldDir, newDir);
  main.fillRemotes();
  const p1 = find();
  const shown = await page(`projects.find(p => p.next === '換顏色').localPath`);

  // 2. GitHub 改名，本機改了 origin → 記下新名稱（舊名稱也留著）
  gitInit(newDir, 'git@github.com:j/Bead-Studio.git');
  main.fillRemotes();
  const p2 = find();

  // 3. 另一台電腦用新名稱 clone 到別的地方 → 認得是同一個專案
  const clone = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-clone-'));
  gitInit(clone, 'https://github.com/j/bead-studio');
  const cli = await runCli(['--cwd', clone, '--progress', '新電腦']);

  // 4. 這台電腦本來沒有、後來在記錄的路徑 git clone 回來 → 叫出視窗時就不再顯示「找不到」
  const later = path.join(root, 'Later');
  await runCli(['--cwd', later, '--next', '之後才 clone']);
  const missingBefore = await page(`projects.find(p => p.next === '之後才 clone').localPath`);
  gitInit(later, 'https://github.com/j/later.git');
  main.showWin();
  await new Promise((r) => setTimeout(r, 300));
  const foundAfter = await page(`projects.find(p => p.next === '之後才 clone').localPath`);

  const result = {
    clonedLaterFound: missingBefore === '' && path.resolve(foundAfter || '.') === path.resolve(later),
    relocated: path.resolve(p1.path) === path.resolve(newDir),
    keptOldPath: p1.paths.length === 2,
    pageLocalPath: path.resolve(shown) === path.resolve(newDir),
    otherUntouched: main.getData().projects.find((p) => p.next === '別的').paths.length === 1,
    remotes: p2.remotes,
    cloneMatched: find().progress === '新電腦' && main.getData().projects.length === 3,
    cliCode: cli.code,
  };
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(clone, { recursive: true, force: true });
  return result;
};
