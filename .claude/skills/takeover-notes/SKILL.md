---
name: takeover-notes
description: 修改、測試、打包、發布「接管筆記」桌面 App（Takeover Notes，原始碼在 C:\Users\user\ProjectNotes，GitHub jamesldswang/Takeover-Notes；Electron，記錄每個 Claude Code 專案的現在進度和下一步，Ctrl+Alt+N 叫出快速切換並開啟 Claude Code，Claude Code 開啟專案時透過 SessionStart hook 跳出提醒，可用同步資料夾或匯出匯入在多台電腦接續工作）。只要使用者要改接管筆記（以前叫「專案筆記」）的功能或畫面、修 bug、改提醒、hook、同步或換電腦的行為、重新打包 zip、發布 Release、更新版號或 README，就先載入這個 skill。
---

# 接管筆記 App

這是一個 Electron 桌面 App（1.0.0 之前叫「專案筆記」）。它把一個單頁的 `notes.html` 包成常駐在系統匣的視窗，按 **Ctrl+Alt+N** 叫出快速切換。在 Claude Code 開啟專案時，SessionStart hook（`hook.js`）會通知 App，App 跳出提醒問使用者要不要立刻執行下一步。資料可以放在同步資料夾，讓多台電腦接續工作。使用者用繁體中文溝通，回覆、程式註解、UI 文字也都用繁體中文。

原始碼資料夾是 `C:\Users\user\ProjectNotes`（沒有改名，資料夾名稱和 App 名稱不同），GitHub 是 `https://github.com/jamesldswang/Takeover-Notes`，分支 `main`。

## 檔案

| 檔案 | 內容 |
|------|------|
| `notes.html` | **畫面和互動都在這裡**：HTML、CSS、JS 寫在同一個檔案。兩種模式：**快速切換**（`.launcher-view`，Ctrl+Alt+N 叫出來就是這個，上方有「還沒連接 Claude Code」提示 `hookBanner`）和**完整筆記**（`.main`：左側專案清單、右側專案內容），另外有新增、刪除、提醒、⚙ 設定對話框 |
| `main.js` | Electron 主程式。最上面是**命令列模式**（`--hook`／`--cli`）；其餘是無邊框透明視窗（依模式切換大小）、開啟 Claude Code（`launchClaude`）、全域快捷鍵、系統匣選單、開機自動啟動、失焦自動隱藏、注入 `APP_CSS`、**保管資料並寫檔、同步資料夾輪詢合併**、**本機 HTTP server**（給 hook／cli）、提醒流程、設定（資料位置、匯出匯入、連接 Claude Code） |
| `store.js` | 資料操作的純函式（不碰 Electron）：`normPath`、`homeRel`、`normRemote`、`normalize`、`findByPath`、`touch`、`update`、`completeNext`、`remove`、**`merge`**、`canon` |
| `claude-setup.js` | 把 hook 寫進／移出 Claude Code 的 `settings.json`：`hookCommand`、`status`、`install`、`uninstall`、`isOurs` |
| `preload.js` | 在紅綠燈旁放版號；紅點／黃點按下去會隱藏視窗；提供 `window.__notesApp`（資料存取、提醒、模式、設定、`show/pin/unpin`） |
| `hook.js` | Claude Code SessionStart hook：讀 stdin 的 `cwd`、`source`，POST `/session-start`，等使用者回答，輸出 `additionalContext`（和「立刻執行」時的 `systemMessage`） |
| `cli.js` | 命令列：`--progress`、`--next`、`--done`、`--name`、`--cwd` |
| `client.js` | hook／cli 共用的 HTTP client；`ensureApp()` 在 App 沒開時啟動它；`cliCommand()` 產生給 Claude 看的更新指令 |
| `build.js` | 打包腳本（`npm run dist`），產出 `dist/TakeoverNotes-<版號>-win-x64/`（`接管筆記.exe`）和同名 `.zip` |
| `tools/run-in-app.js` | 測試工具：在真正的 App 裡跑測試，可以操作頁面、執行 hook 和 cli |
| `tools/*-test.js` | 測試（見「測試」） |
| `tools/release.sh`、`tools/release-body.js` | 建立 GitHub Release 並上傳 zip（說明取自 README 的版本紀錄） |
| `README.md` | 給使用者看的說明，最後有「版本紀錄」 |
| `start.vbs` | 不經打包、直接從原始碼啟動 App 的捷徑 |

`notes.html` 一定要能單獨用瀏覽器打開：沒有 `window.__notesApp` 時會改用頁面裡的 `localApi()`（存 localStorage）。**`window.__notesApp` 加了新方法，`localApi()` 也要補一個同名的**（做不到的就放空函式）。

`hook.js`、`cli.js`、`client.js`、`claude-setup.js` 會被 `build.js` 一起打包進 `resources/app`，用 Node 模式執行，所以**只能用 Node 內建模組，不能 `require('electron')`**。

## 每次修改後的流程

1. **改程式**：畫面和互動改 `notes.html`；資料規則和合併改 `store.js`；視窗、快捷鍵、系統匣、HTTP、提醒、同步改 `main.js`；Claude 收到的內容改 `hook.js` 的 `buildOutput()`；寫 settings.json 的方式改 `claude-setup.js`。新增要打包的檔案，要加進 `build.js` 的檔案清單。
2. **先關掉正在跑的 App**：App 有單一實例鎖，沒關掉的話，測試和打包都會出問題。
   ```bash
   powershell -NoProfile -Command "Get-Process | Where-Object { \$_.Path -like 'C:\Users\user\ProjectNotes\*' } | Stop-Process -Force"
   ```
3. **測試**（見下一節），四個都要跑。
4. **更新 `README.md`**：在功能表格和「版本紀錄」裡補上這次的變更。如果原本的「已知限制」解決了，就把那一條刪掉。
5. **打包**：`npm run dist`
6. **重新啟動 App**：使用者平常用的是打包版。
   ```bash
   powershell -NoProfile -Command "Start-Process 'C:\Users\user\ProjectNotes\dist\TakeoverNotes-1.0.0-win-x64\接管筆記.exe'"
   ```
   路徑裡的 `1.0.0` 要換成現在的版號。換了版號，exe 路徑就變了：settings.json 裡的 hook 會指向舊路徑，App 會顯示「連接的是別的位置」，請使用者按「重新連接」（或在系統匣勾選）。
7. **使用者要發布時**：`git` commit、push，再 `bash tools/release.sh`（要先打包；README 版本紀錄要有 `### <版號>` 段落）。同一個版號只能建立一次 Release。

版號在 `package.json` 的 `version`。使用者沒說要改就不要動；改了之後，視窗左上角、系統匣選單和 zip 檔名都會自動跟著變。

## 測試

```bash
cd /c/Users/user/ProjectNotes
node tools/store-test.js                                                             # 純邏輯：合併、換電腦認專案
./node_modules/electron/dist/electron.exe tools/run-in-app.js tools/example-test.js     # 開啟 → 記錄 → 提醒 → 立刻執行 → 完成
./node_modules/electron/dist/electron.exe tools/run-in-app.js tools/launcher-test.js    # 快速切換
./node_modules/electron/dist/electron.exe tools/run-in-app.js tools/portable-test.js    # 連接 Claude Code、同步資料夾、兩台同時改
```

- `run-in-app.js` 的測試檔是 Node 模組：`module.exports = async ({ page, runHook, runCli, win, port, userData, claudeDir }) => 結果`。結果會印成一行 `RESULT {...}`。
  - `page(js)`：在 `notes.html` 裡執行 JS，可以直接用頁面的全域函式和變數（`projects`、`selectProject()`、`answerReminder()`…）。
  - `runHook(input)`：用 node 跑 `hook.js`，`input` 是 hook 的 stdin（`{ cwd, source }`）。有提醒時它會一直等，要先在 `page()` 裡呼叫 `answerReminder('run' | 'later')` 才會結束，所以先拿 Promise、不要馬上 await。
  - `runCli(args)`：用 node 跑 `cli.js`。
  - 測試檔可以 `require('../main.js')` 拿 `launches`、`setDataDir`、`pollDataFile`、`getData`。
- 測試用獨立的暫存 userData、暫存的 Claude Code 設定資料夾（`CLAUDE_CONFIG_DIR`）和另一個 port，**不會動到使用者的筆記和 Claude Code 設定**。`PROJECT_NOTES_TEST` 讓 App 不寫剪貼簿、不搬舊資料、`launchClaude` 只記在 `launches` 不真的開、視窗不接收滑鼠（測試視窗會出現在使用者螢幕上，滑鼠經過會改到選取）；`PROJECT_NOTES_NO_LAUNCH` 讓 hook／cli 不會自己開 App。
- `run-in-app.js` 要在 `require(main.js)` **之後**才 `app.setPath('userData')`，因為 main.js 會 `app.setName()`。
- **測試檔、測試用 JS 檔要用 Write 工具寫，不要用 bash heredoc。** 這個環境的 bash 會吃掉反斜線（`\d`、`\\`、`C:\Users` 都會壞掉）。Windows 路徑一律用正斜線。
- 測試檔不要放進 `dist`。

### 打包版的換電腦測試

改到 hook、cli、client、命令列模式時，要用 zip 解壓縮的副本、**PATH 不含 Node.js** 實測：

```bash
X=<解壓縮的資料夾>
( export PATH=/c/Windows/System32; echo '{"cwd":"C:/Users/user/ProjectNotes","source":"clear"}' | "$X/接管筆記.exe" --hook )
( export PATH=/c/Windows/System32; "$X/接管筆記.exe" --cli --cwd C:/Users/user/ClockApp )
```

也要確認 Node 用 `shell: 'C:\\Windows\\System32\\cmd.exe'` 和 Git Bash 執行 hook 指令都能跑（Claude Code 是 Node 程式）。測完把副本刪掉，並把使用者的打包版重新啟動。

### 畫面確認

1. 用 SendKeys 送出 `^%n` 叫出視窗（會是快速切換模式；再送 `{TAB}` 進完整筆記）。
2. 用 PowerShell 截圖，再用 Read 看圖。截圖程式要先呼叫 `SetProcessDPIAware()`，因為螢幕是 1920×1080、150% 縮放；不呼叫的話，抓到的座標和畫面對不起來。
3. 視窗大小（邏輯像素）在 `main.js` 的 `SIZES`：快速切換 600×440、完整筆記 760×580。`notes.html` 的 `.window.launcher` 和 `.window` 要一起改。開啟時會放在滑鼠所在螢幕的正中央。
4. **畫面確認時不要在快速切換按 Enter**，會真的開一個 Claude Code 視窗。要測開啟流程用 `launcher-test.js`。

**截圖會拍到使用者桌面上的其他視窗，例如聊天內容。截圖存在 scratchpad，看完馬上刪掉，也不要在回覆裡描述截圖裡別人的內容。**

## 一定要知道的限制與踩過的坑

- **Fn 鍵不能當快捷鍵。** Fn 是筆電鍵盤韌體自己處理的，Windows 收不到。快捷鍵定義在 `main.js` 的 `HOTKEY`。
- **不能打包成單一 `.exe`。** 這台電腦開了 Windows 11 的「智慧型應用程式控制」，會擋下沒有數位簽章、又沒有信譽的執行檔。electron-builder 產生的 portable exe 會被擋，錯誤訊息是 `An Application Control policy has blocked this file`。`build.js` 的做法是直接複製原版的 `electron.exe` 並改名成 `接管筆記.exe`，檔案內容（hash）不變，所以 Windows 認得、不會擋。**不要改用 electron-builder，也不要修改 exe 本身**，例如改圖示或寫入版本資訊。
- **圖示不能用 SVG。** Windows 的 `nativeImage` 讀不了 SVG，系統匣會變成灰色空框。現在是 `main.js` 的 `drawIconBitmap(size)` 直接畫 BGRA 點陣圖（黃色便條紙），再用 `nativeImage.createFromBitmap` 轉成圖示；系統匣用 16px，另外用 `addRepresentation` 附 32px 給高 DPI。要改圖示就改這個函式。
- **electron-builder 的 winCodeSign 解壓會失敗**，因為這台電腦沒有建立 symlink 的權限。沒有用 electron-builder，只是記錄下來。
- **npm 預設擋 postinstall。** 第一次 `npm install` 之後，要執行 `npm install-scripts approve electron` 和 `npm rebuild electron`，才會下載 Electron 執行檔。
- **Electron 主程式讀不到 stdin。** 直接在主程式讀 `process.stdin` 會永遠卡住（試過，hook 會掛到 Claude Code 逾時）。所以 `接管筆記.exe --hook` 在 `main.js` 最上面用 `spawnSync(process.execPath, [hook.js], { stdio: 'inherit', env: { ELECTRON_RUN_AS_NODE: '1' } })` 再執行自己一次。這段一定要在 `requestSingleInstanceLock()` 之前，否則 App 開著時 hook 會被單一實例鎖擋掉。
- **從 Node 模式啟動 App 時要拿掉 `ELECTRON_RUN_AS_NODE`**（`client.ensureApp()`），否則啟動的 App 也是 Node 模式，什麼都不做。
- **hook 指令不要用環境變數語法或 node。** settings.json 的指令是 `"…/接管筆記.exe" --hook`（正斜線、加引號），cmd.exe 和 Git Bash 都能執行，中文路徑也沒問題，另一台電腦也不用裝 Node.js。
- **改 settings.json 要非常小心**（`claude-setup.js`）：讀不懂的 JSON 絕對不覆蓋（回報錯誤）；只移除 `isOurs()` 認得的接管筆記 hook，保留使用者其他設定和 hook；寫之前備份成 `settings.json.takeover-notes.bak`；尊重 `CLAUDE_CONFIG_DIR`。只在使用者按「連接」或在系統匣勾選時才寫。**Claude 自己不要直接改使用者的 `~/.claude/settings.json`**（權限系統會擋），請使用者在 App 裡按。
- **視窗失焦會自動隱藏。** 跳出提醒時 `main.js` 會設 `pinned = true`，所有提醒都回答完才解除；開系統對話框（選資料夾、匯出、匯入）要包在 `withPinned()` 裡。頁面要自己跳出東西時，先 `window.__notesApp.pin()`，結束後 `unpin()`。**不要用 `confirm()`／`alert()`**，用頁面裡的 `.modal`。
- **hook 絕對不能弄壞 Claude Code。** `hook.js` 任何錯誤都要吞掉、exit 0、stdout 只能輸出合法 JSON（或什麼都不輸出）。不要在 hook 裡 `console.log` 除錯訊息。
- **hook 會卡住 Claude Code 的啟動，直到使用者回答提醒。** 時間限制有三層，要一起看：`main.js` 的 `REMINDER_TIMEOUT_MS`（90 秒，逾時當成「稍後」）< `hook.js` 的 HTTP timeout（115 秒）< `claude-setup.js` 的 `HOOK_TIMEOUT`（120 秒）。改其中一個要維持這個大小順序。
- **「立刻執行」沒辦法替使用者送出訊息。** SessionStart hook 只能給 `additionalContext` 和 `systemMessage`，Claude 要等使用者第一則訊息才會動。所以 `additionalContext` 裡告訴 Claude「第一則訊息就算只是『開始』也要執行下一步」，並把指令複製到剪貼簿。
- **本機 HTTP 的安全規則。** 只 listen `127.0.0.1`，帶 `Origin` header 的請求（瀏覽器發的）一律 403。新增 API 時維持這兩點。`open-folder` 只開清單裡已有專案的路徑，不接受頁面傳來的任意路徑。
- **開啟 Claude Code 用 `cmd /c start "標題" /D "資料夾" "claude.exe" [--continue]`**，spawn 時要 `windowsVerbatimArguments: true`，引號才不會被 Node 再包一層。不能直接 `spawn(claude.exe, { detached: true, stdio: 'ignore' })`：claude 需要真的主控台當輸入輸出，`ignore` 會給它 NUL。標題要拿掉 `" ^ & | < > %`。這台電腦**沒有 Windows Terminal（wt.exe）和 pwsh**，不要改用它們。`claude.exe` 在 `%USERPROFILE%\.local\bin`（`claudeExe()`），找不到用 PATH。開啟的資料夾是 `localPath(p)`（這台電腦上存在的路徑），開啟時會 `touch()` 更新 `lastOpenedAt`。
- **兩種模式由 `main.js` 決定視窗大小。** 頁面要切換用 `setMode(m, true)`（會叫 `api.setMode` 改大小）；`main.js` 送來的 `mode` 事件用 `setMode(m, false)` 只切畫面。快捷鍵、系統匣左鍵、second-instance 一律開快速切換；提醒和設定一律切完整筆記。
- **使用者輸入的文字要跳脫。** 專案名稱、進度、下一步、路徑這類字，放進 `innerHTML` 之前一定要先經過 `escapeHtml()`，或改用 `textContent`。
- **打字時不要重畫正在編輯的欄位。** 資料變動時 `renderDetail(false)` 只更新沒有焦點的欄位（`setIfIdle`），不然游標會跳走。整個重建只在切換專案時用 `renderDetail(true)`。
- **開機自動啟動、寫入 Startup 資料夾這類會一直留在系統上的設定**，不要自己做，只能留給使用者在系統匣選單自己勾。

## 資料怎麼存

- **資料由 `main.js` 保管**。`notes.json` 預設在 `%APPDATA%\接管筆記`（`app.setName('接管筆記')` 決定的 userData），使用者可以在設定改到同步資料夾，位置記在 userData 的 `config.json`（`{ dataDir }`）。第一次啟動會把舊的 `%APPDATA%\專案筆記\notes.json` 搬過來（`migrateOldData()`）。
- 寫檔有 300ms 防抖，先寫 `.tmp` 再改名；結束 App 時會把還沒寫的資料寫完。**寫之前如果檔案的修改時間跟上次讀寫的不一樣（`knownMtime`），先 `merge` 再寫**，避免蓋掉另一台電腦的內容。
- 每 3 秒 `pollDataFile()`：檔案被別台電腦改過就讀進來 `merge`；合併結果和檔案內容不同（用 `canon()` 比，不管順序）才寫回去。
- **`merge(a, b)` 的結果不能跟順序有關**（`canon(merge(a,b)) === canon(merge(b,a))`），也要 `merge(m, m) === m`。否則兩台電腦會互相認為對方不一樣，一直改寫同步資料夾的檔案。所以：id 取較小的、內容取 `updatedAt` 較新的（一樣新取 JSON 較大的）、路徑和完成紀錄取聯集並排序。改 merge 一定要跑 `store-test.js`。
- 頁面不直接寫檔：透過 `window.__notesApp` 的 `list/add/update/complete/remove` 用 IPC 叫 `main.js` 改；改完 `main.js` 呼叫 `changed()`，送 `data-changed` 給頁面重畫（`viewProjects()` 會多加 `localPath`）。hook／cli／同步改的資料也走同一條路。
- **只要在 `main.js` 改到 `data`，就要呼叫 `changed()`。** 開啟／新增專案要用 `main.js` 的 `touch()`（會帶上 git remote），不要直接呼叫 `store.touch()`。
- 頁面打字時先放在 `edits`，停 0.4 秒或視窗失焦時才 `flushEdits()` 送出。切換專案、按按鈕前要先 `flushEdits()`。
- 資料格式（`{ projects, deleted }`）：
  ```js
  { id, name,
    path,                  // 最近一次使用的路徑
    paths: [],             // 各台電腦用過的所有路徑
    homePaths: [],         // 相對於該台電腦家目錄的路徑（換電腦時認專案用）
    remote: '',            // git origin，正規化成 github.com/owner/repo（換電腦時認專案用）
    progress: '',          // ① 現在的進度
    next: '',              // ② 下一步；有內容才會在開啟時提醒
    remind: true,          // 開啟專案時要不要提醒
    history: [{ at, text }],  // 完成紀錄，最新的在最前面（completeNext() 產生）
    createdAt, updatedAt, lastOpenedAt }  // ISO 字串；updatedAt 只在內容改變時更新（合併用）
  deleted: [{ id, at }]    // 刪除紀錄；比專案 updatedAt 新才算刪除
  ```
  - **認專案**（`findByPath()`）：① 路徑相同或 cwd 在它底下（取最深的）② git remote 相同 ③ 家目錄底下的相對路徑相同。用 ②③ 認到時 `touch()` 會把新路徑加進 `paths`。git remote 由 `main.js` 的 `gitRemote(dir)` 直接讀 `.git/config`（支援 worktree 的 `.git` 檔案）。
  - 改資料格式時，要考慮使用者已經存的舊資料（包括 1.0.0 前的專案筆記格式）：在 `store.js` 的 `normalizeProject()` 補預設值。`update()` 只接受 `EDITABLE` 裡的欄位（路徑不能從畫面改）。

## 提醒流程

1. Claude Code 開啟專案 → 執行 `"…/接管筆記.exe" --hook`（matcher `startup|resume`）→ `main.js` 用 Node 模式跑 `hook.js`。家目錄不記錄。
2. `client.ensureApp()`：App 沒開就啟動（拿掉 `ELECTRON_RUN_AS_NODE`），最多等 10 秒。
3. POST `/session-start { cwd, source }` → `touch()` 加入或更新開啟時間。有 `remind` 而且 `next` 不是空的 → `askReminder()`：設 `pinned`、叫出完整筆記、送 `reminder { reqId, projectId }` 給頁面；HTTP 回應先不送。
4. 頁面 `showReminder()` 顯示 `reminderModal`，多個提醒排隊（`reminders`）。使用者按按鈕 → `answerReminder(action)`：如果改了下一步先 `update`，再送回 `main.js`。
5. `finishReminder()` 回應 HTTP `{ action: 'run' | 'later' | 'timeout' | 'none', project }`；`run` 時把「開始執行下一步：…」寫到剪貼簿。
6. `hook.js` 的 `buildOutput()` 輸出 `additionalContext`（專案名稱、進度、下一步、要不要執行、`cliCommand()` 產生的更新指令）；`run` 時另外有 `systemMessage` 顯示給使用者。

## 功能清單（改之前先看有沒有現成的函式可以用）

- **快速切換**：`setMode(m, tellMain)`、`launcherItems()`（搜尋結果；輸入看起來像路徑、清單又沒有時，最後多一項 `{ type: 'new', path }`）、`renderLauncher()`、`launcherKey(e)`（↑↓／Enter／Shift+Enter／Tab／Esc）、`runLauncher(i, cont)`、`openClaude(id, cont)`、`openNotes(i)`、`shownPath(p)`、`pathHtml(p)`（這台電腦找不到時加提示）；主程式 `showWin(mode)`、`launchClaude(p, cont)`、`claudeExe()`、`localPath(p)`。
- **設定**：頁面 `openSettings()`、`renderSettings()`、`renderHookBanner()`、`settingsAction(fn, okText)`、`connectClaude()`、`disconnectClaude()`、`chooseDataDir()`、`resetDataDir()`、`exportData()`、`importData()`；主程式 `settingsInfo()`、`hookCmd()`、`setDataDir(dir)`、`chooseDataDir()`、`exportData()`、`importData()`、`withPinned(fn)`、`pollDataFile()`、`gitRemote(dir)`。
- **清單**：`renderList()`（依搜尋框過濾）、`sortedProjects()`（最近開啟排前面）、`selectProject(id)`、`relTime(iso)`、`fmtDate(iso)`。
- **內容**：`renderDetail(full)`、`setIfIdle(id, value)`、`queueEdit(field, value)`、`flushEdits()`、`setRemind(on)`、`completeNext()`。
- **新增／刪除**：`openAddModal()`、`addProject()`、`askDelete(id)`、`confirmDelete()`、`openModal(id)`、`closeModal(id)`。
- **提醒**：頁面 `showReminder()`、`answerReminder(action)`、`api.onReminder`、`api.onReminderCancel`；主程式 `askReminder(project)`、`flushReminders()`（頁面還沒載入好時先排著，載入完再送）、`finishReminder(reqId, action)`。
- **HTTP API**（`main.js` 的 `startServer()`）：`GET /ping`（回 `{ app: 'takeover-notes' }`）、`POST /session-start { cwd, source }`、`POST /get { cwd }`、`POST /update { cwd, progress?, next?, name?, done? }`。port 是 `PROJECT_NOTES_PORT` 環境變數或 47321，`client.js` 和 `main.js` 要一致。
