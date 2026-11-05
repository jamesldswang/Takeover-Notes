// 打包成可攜式資料夾 + zip：dist/ProjectNotes-<version>-win-x64(.zip)
// 直接沿用原版 electron.exe（只改檔名、內容不變），
// 避免被 Windows「智慧型應用程式控制」當成不明程式擋下。
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const pkg = require('./package.json');
const name = `ProjectNotes-${pkg.version}-win-x64`;
const out = path.join(__dirname, 'dist', name);
const zip = out + '.zip';

fs.rmSync(out, { recursive: true, force: true });
fs.rmSync(zip, { force: true });
fs.cpSync(path.join(__dirname, 'node_modules', 'electron', 'dist'), out, { recursive: true });
fs.renameSync(path.join(out, 'electron.exe'), path.join(out, '專案筆記.exe'));
fs.rmSync(path.join(out, 'resources', 'default_app.asar'), { force: true });

const appDir = path.join(out, 'resources', 'app');
fs.mkdirSync(appDir, { recursive: true });
for (const f of ['main.js', 'preload.js', 'store.js', 'notes.html']) {
  fs.copyFileSync(path.join(__dirname, f), path.join(appDir, f));
}
fs.writeFileSync(path.join(appDir, 'package.json'), JSON.stringify({
  name: pkg.name, productName: pkg.productName, version: pkg.version, main: pkg.main,
}, null, 2));
fs.copyFileSync(path.join(__dirname, 'README.md'), path.join(out, 'README.md'));

execFileSync('powershell', ['-NoProfile', '-Command',
  `Compress-Archive -Path '${out}' -DestinationPath '${zip}' -Force`], { stdio: 'inherit' });

console.log('完成：' + zip);
