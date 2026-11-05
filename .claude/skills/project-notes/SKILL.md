---
name: project-notes
description: 修改、測試、打包「專案筆記」桌面 App（C:\Users\user\ProjectNotes，Electron，記錄每個 Claude Code 專案的現在進度和下一步，Ctrl+Alt+N 叫出，Claude Code 開啟專案時透過 SessionStart hook 跳出提醒）。只要使用者要改專案筆記 App 的功能或畫面、修 bug、改提醒或 hook 的行為、重新打包 zip、更新版號或 README，就先載入這個 skill。
---

# 專案筆記 App

這是一個 Electron 桌面 App。它把一個單頁的 `notes.html` 包成常駐在系統匣的視窗，按 **Ctrl+Alt+N** 會跳出來或隱藏。另外有一支 Claude Code 的 SessionStart hook（`hook.js`），在 Claude Code 開啟專案時通知 App，App 跳出提醒問使用者要不要立刻執行下一步。使用者用繁體中文溝通，回覆、程式註解、UI 文字也都用繁體中文。

## 檔案

| 檔案 | 內容 |
|------|------|
| `notes.html` | **畫面和互動都在這裡**：HTML、CSS、JS 寫在同一個檔案。兩種模式：**快速切換**（`.launcher-view`，Ctrl+Alt+N 叫出來就是這個）和**完整筆記**（`.main`：左側專案清單、右側專案內容），另外有新增／刪除對話框、開啟提醒對話框 |
| `main.js` | Electron 主程式：無邊框透明視窗（依模式切換大小）、開啟 Claude Code（`launchClaude`）、全域快捷鍵、系統匣選單、開機自動啟動、失焦自動隱藏、注入 App 專用的 CSS（`APP_CSS`）、**保管資料並寫檔**、**本機 HTTP server**（給 hook／cli）、提醒流程 |
| `store.js` | 資料操作的純函式（不碰 Electron）：`normPath`、`normalize`、`findByPath`、`touch`、`update`、`completeNext`、`remove` |
| `preload.js` | 在紅綠燈旁放版號；紅點／黃點按下去會隱藏視窗；提供 `window.__notesApp`（資料存取、提醒、`show/pin/unpin`） |
| `hook.js` | Claude Code SessionStart hook：讀 stdin 的 `cwd`、`source`，POST `/session-start`，等使用者回答，輸出 `additionalContext`（和「立刻執行」時的 `systemMessage`） |
| `cli.js` | 命令列：`--progress`、`--next`、`--done`、`--name`、`--cwd` |
| `client.js` | hook／cli 共用的 HTTP client；`ensureApp()` 在 App 沒開時啟動最新的打包版（找不到就用原始碼版） |
| `build.js` | 打包腳本（`npm run dist`），產出 `dist/ProjectNotes-<版號>-win-x64/` 和同名 `.zip` |
| `tools/run-in-app.js` | 測試工具：在真正的 App 裡跑測試，可以操作頁面、執行 hook 和 cli |
| `README.md` | 給使用者看的說明，最後有「版本紀錄」 |
| `start.vbs` | 不經打包、直接從原始碼啟動 App 的捷徑 |

`notes.html` 一定要能單獨用瀏覽器打開：沒有 `window.__notesApp` 時會改用頁面裡的 `localApi()`（存 localStorage）。**`window.__notesApp` 加了新方法，`localApi()` 也要補一個同名的**（做不到的就放空函式）。

`hook.js`、`cli.js`、`client.js` **不會打包進 dist**，直接從原始碼資料夾執行（settings.json 裡寫死 `C:/Users/user/ProjectNotes/hook.js`）。所以它們只能用 Node 內建模組，不能 `require('electron')`。

## 每次修改後的流程

1. **改程式**：畫面和互動改 `notes.html`；資料規則改 `store.js`；視窗、快捷鍵、系統匣、HTTP、提醒流程改 `main.js`；Claude 收到的內容改 `hook.js` 的 `buildOutput()`。
2. **先關掉正在跑的 App**：App 有單一實例鎖，沒關掉的話，測試和打包都會出問題。
   ```bash
   powershell -NoProfile -Command "Get-Process | Where-Object { \$_.Path -like 'C:\Users\user\ProjectNotes\*' } | Stop-Process -Force"
   ```
3. **測試**（見下一節）。
4. **更新 `README.md`**：在功能表格和「版本紀錄」裡補上這次的變更。如果原本的「已知限制」解決了，就把那一條刪掉。
5. **打包**：`npm run dist`
6. **重新啟動 App**：使用者平常用的是打包版。
   ```bash
   powershell -NoProfile -Command "Start-Process 'C:\Users\user\ProjectNotes\dist\ProjectNotes-1.0.0-win-x64\專案筆記.exe'"
   ```
   路徑裡的 `1.0.0` 要換成現在的版號。

版號在 `package.json` 的 `version`。使用者沒說要改就不要動；改了之後，視窗左上角、系統匣選單和 zip 檔名都會自動跟著變，`client.js` 也會自動改用最新版號的 exe。

## 測試

### 邏輯測試（優先用這個）

寫一個測試檔，用 `tools/run-in-app.js` 在真正的 App 裡執行：

```bash
cd /c/Users/user/ProjectNotes
./node_modules/electron/dist/electron.exe tools/run-in-app.js <測試檔.js>
```

- 測試檔是 Node 模組：`module.exports = async ({ page, runHook, runCli, win, port, userData }) => 結果`。結果會印成一行 `RESULT {...}`。
  - `page(js)`：在 `notes.html` 裡執行 JS，可以直接用頁面的全域函式和變數（`projects`、`selectProject()`、`answerReminder()`…）。
  - `runHook(input)`：用 node 跑 `hook.js`，`input` 是 hook 的 stdin（`{ cwd, source }`）。有提醒時它會一直等，要先在 `page()` 裡呼叫 `answerReminder('run' | 'later')` 才會結束，所以先拿 Promise、不要馬上 await。
  - `runCli(args)`：用 node 跑 `cli.js`。
- 測試用的是獨立的暫存 userData 和另一個 port，**不會動到使用者的筆記，也不會跟正在跑的 App 搶 port**。另外設了 `PROJECT_NOTES_TEST`（不寫剪貼簿）和 `PROJECT_NOTES_NO_LAUNCH`（hook／cli 不會自己開 App）。
- 範例在 `tools/example-test.js`，走完「開啟 → 記錄 → 提醒 → 立刻執行 → 完成」整個流程。`tools/launcher-test.js` 測快速切換（搜尋、↑↓、Enter／Shift+Enter、貼路徑、Tab、Esc、視窗大小）。改完兩個都要跑。
- 測試模式（`PROJECT_NOTES_TEST`）下 `launchClaude` 不會真的開視窗，只記在 `main.js` 匯出的 `launches` 陣列，測試檔用 `require('../main.js').launches` 讀。
- 測試檔裡的 Windows 路徑用正斜線（`'C:/Users/user/X'`），反斜線容易在 heredoc／字串跳脫時出錯。
- 測試檔不要放進 `dist`。`build.js` 只會複製 `main.js`、`preload.js`、`store.js`、`notes.html`。

### 畫面確認

1. 用 SendKeys 送出 `^%n` 叫出視窗（會是快速切換模式；再送 `{TAB}` 進完整筆記）。
2. 用 PowerShell 截圖，再用 Read 看圖。截圖程式要先呼叫 `SetProcessDPIAware()`，因為螢幕是 1920×1080、150% 縮放；不呼叫的話，抓到的座標和畫面對不起來。
3. 視窗大小（邏輯像素）在 `main.js` 的 `SIZES`：快速切換 600×440、完整筆記 760×580。`notes.html` 的 `.window.launcher` 和 `.window` 要一起改。開啟時會放在滑鼠所在螢幕的正中央。
4. **畫面確認時不要在快速切換按 Enter**，會真的開一個 Claude Code 視窗。要測開啟流程用 `launcher-test.js`。

**截圖會拍到使用者桌面上的其他視窗，例如聊天內容。截圖存在 scratchpad，看完馬上刪掉，也不要在回覆裡描述截圖裡別人的內容。**

## 一定要知道的限制與踩過的坑

- **Fn 鍵不能當快捷鍵。** Fn 是筆電鍵盤韌體自己處理的，Windows 收不到。快捷鍵定義在 `main.js` 的 `HOTKEY`。
- **不能打包成單一 `.exe`。** 這台電腦開了 Windows 11 的「智慧型應用程式控制」，會擋下沒有數位簽章、又沒有信譽的執行檔。electron-builder 產生的 portable exe 會被擋，錯誤訊息是 `An Application Control policy has blocked this file`。`build.js` 的做法是直接複製原版的 `electron.exe` 並改名成 `專案筆記.exe`，檔案內容（hash）不變，所以 Windows 認得、不會擋。**不要改用 electron-builder，也不要修改 exe 本身**，例如改圖示或寫入版本資訊。
- **圖示不能用 SVG。** Windows 的 `nativeImage` 讀不了 SVG，系統匣會變成灰色空框。現在是 `main.js` 的 `drawIconBitmap(size)` 直接畫 BGRA 點陣圖（黃色便條紙），再用 `nativeImage.createFromBitmap` 轉成圖示；系統匣用 16px，另外用 `addRepresentation` 附 32px 給高 DPI。要改圖示就改這個函式。
- **electron-builder 的 winCodeSign 解壓會失敗**，因為這台電腦沒有建立 symlink 的權限。沒有用 electron-builder，只是記錄下來。
- **npm 預設擋 postinstall。** 第一次 `npm install` 之後，要執行 `npm install-scripts approve electron` 和 `npm rebuild electron`，才會下載 Electron 執行檔。
- **視窗失焦會自動隱藏。** 跳出提醒時 `main.js` 會設 `pinned = true`，所有提醒都回答完才解除；頁面要自己跳出東西時，先 `window.__notesApp.pin()`，結束後 `unpin()`。**不要用 `confirm()`／`alert()`**，原生對話框會讓視窗失焦被收起來；用頁面裡的 `.modal`（例如刪除確認 `confirmModal`）。
- **hook 絕對不能弄壞 Claude Code。** `hook.js` 任何錯誤都要吞掉、exit 0、stdout 只能輸出合法 JSON（或什麼都不輸出）。不要在 hook 裡 `console.log` 除錯訊息。
- **hook 會卡住 Claude Code 的啟動，直到使用者回答提醒。** 時間限制有三層，要一起看：`main.js` 的 `REMINDER_TIMEOUT_MS`（90 秒，逾時當成「稍後」）< `hook.js` 的 HTTP timeout（115 秒）< settings.json 的 hook `timeout`（120 秒）。改其中一個要維持這個大小順序。
- **「立刻執行」沒辦法替使用者送出訊息。** SessionStart hook 只能給 `additionalContext` 和 `systemMessage`，Claude 要等使用者第一則訊息才會動。所以 `additionalContext` 裡告訴 Claude「第一則訊息就算只是『開始』也要執行下一步」，並把指令複製到剪貼簿。
- **本機 HTTP 的安全規則。** 只 listen `127.0.0.1`，帶 `Origin` header 的請求（瀏覽器發的）一律 403。新增 API 時維持這兩點。`open-folder` 只開清單裡已有專案的路徑，不接受頁面傳來的任意路徑。
- **開啟 Claude Code 用 `cmd /c start "標題" /D "資料夾" "claude.exe" [--continue]`**，spawn 時要 `windowsVerbatimArguments: true`，引號才不會被 Node 再包一層。不能直接 `spawn(claude.exe, { detached: true, stdio: 'ignore' })`：claude 需要真的主控台當輸入輸出，`ignore` 會給它 NUL。標題要拿掉 `" ^ & | < > %`。這台電腦**沒有 Windows Terminal（wt.exe）和 pwsh**，不要改用它們。`claude.exe` 在 `%USERPROFILE%\.local\bin`（`claudeExe()`）。開啟前會檢查資料夾存在，並更新 `lastOpenedAt`（沒裝 hook 也能排序）。
- **兩種模式由 `main.js` 決定視窗大小。** 頁面要切換用 `setMode(m, true)`（會叫 `api.setMode` 改大小）；`main.js` 送來的 `mode` 事件用 `setMode(m, false)` 只切畫面。快捷鍵、系統匣左鍵、second-instance 一律開快速切換；提醒一律切完整筆記（`showWin('full')`）。
- **使用者輸入的文字要跳脫。** 專案名稱、進度、下一步這類使用者打的字，放進 `innerHTML` 之前一定要先經過 `escapeHtml()`，或改用 `textContent`。
- **打字時不要重畫正在編輯的欄位。** 資料變動時 `renderDetail(false)` 只更新沒有焦點的欄位（`setIfIdle`），不然游標會跳走。整個重建只在切換專案時用 `renderDetail(true)`。
- **開機自動啟動、寫入 Startup 資料夾這類會一直留在系統上的設定**，不要自己做，只能留給使用者在系統匣選單自己勾。之前直接建立 Startup 捷徑，被權限系統擋下來了。修改使用者的 `~/.claude/settings.json`（hook 設定）也要先問過使用者。

## 資料怎麼存

- **資料由 `main.js` 保管**，存在 `%APPDATA%\專案筆記\notes.json`（Electron 的 userData）。寫檔有 300ms 防抖，先寫 `.tmp` 再改名；結束 App 時會把還沒寫的資料寫完。
- 頁面不直接寫檔：透過 `window.__notesApp` 的 `list/add/update/complete/remove` 用 IPC 叫 `main.js` 改；改完 `main.js` 呼叫 `changed()`，送 `data-changed` 給頁面重畫。hook／cli 改的資料也走同一條路，所以畫面會即時更新。
- **只要在 `main.js` 改到 `data`，就要呼叫 `changed()`。**
- 頁面打字時先放在 `edits`，停 0.4 秒或視窗失焦時才 `flushEdits()` 送出。切換專案、按按鈕前要先 `flushEdits()`。
- 專案的資料格式：
  ```js
  { id, path, name,
    progress: '',          // ① 現在的進度
    next: '',              // ② 下一步；有內容才會在開啟時提醒
    remind: true,          // 開啟專案時要不要提醒
    history: [{ at, text }],  // 完成紀錄，最新的在最前面（completeNext() 產生）
    createdAt, lastOpenedAt } // ISO 字串；lastOpenedAt 是最後一次在 Claude Code 開啟的時間，沒開過是 null
  ```
  - 專案用路徑比對：`normPath()` 統一成小寫、反斜線、去掉結尾斜線。`findByPath()` 找「路徑相同或 cwd 在它底下」裡最深的那個，所以在子資料夾開啟也算同一個專案。
  - 改資料格式時，要考慮使用者已經存的舊資料：在 `store.js` 的 `normalizeProject()` 補預設值。`update()` 只接受 `EDITABLE` 裡的欄位。

## 提醒流程

1. Claude Code 開啟專案 → 執行 `hook.js`（settings.json 的 matcher 是 `startup|resume`）。家目錄不記錄。
2. `client.ensureApp()`：App 沒開就啟動，最多等 10 秒。
3. POST `/session-start { cwd, source }` → `store.touch()` 加入或更新開啟時間。有 `remind` 而且 `next` 不是空的 → `askReminder()`：設 `pinned`、叫出視窗、送 `reminder { reqId, projectId }` 給頁面；HTTP 回應先不送。
4. 頁面 `showReminder()` 顯示 `reminderModal`，多個提醒排隊（`reminders`）。使用者按按鈕 → `answerReminder(action)`：如果改了下一步先 `update`，再 `answerReminder` 送回 `main.js`。
5. `finishReminder()` 回應 HTTP `{ action: 'run' | 'later' | 'timeout' | 'none', project }`；`run` 時把「開始執行下一步：…」寫到剪貼簿。
6. `hook.js` 的 `buildOutput()` 輸出 `additionalContext`（專案名稱、進度、下一步、要不要執行、怎麼用 cli 更新）；`run` 時另外有 `systemMessage` 顯示給使用者。

## 功能清單（改之前先看有沒有現成的函式可以用）

- **快速切換**：`setMode(m, tellMain)`、`launcherItems()`（搜尋結果；輸入看起來像路徑、清單又沒有時，最後多一項 `{ type: 'new', path }`）、`renderLauncher()`、`launcherKey(e)`（↑↓／Enter／Shift+Enter／Tab／Esc）、`runLauncher(i, cont)`、`openClaude(id, cont)`、`openNotes(i)`；主程式 `showWin(mode)`、`launchClaude(p, cont)`、`claudeExe()`。
- **清單**：`renderList()`（依搜尋框過濾）、`sortedProjects()`（最近開啟排前面）、`selectProject(id)`、`relTime(iso)`、`fmtDate(iso)`。
- **內容**：`renderDetail(full)`、`setIfIdle(id, value)`、`queueEdit(field, value)`、`flushEdits()`、`setRemind(on)`、`completeNext()`。
- **新增／刪除**：`openAddModal()`、`addProject()`、`askDelete(id)`、`confirmDelete()`、`openModal(id)`、`closeModal(id)`。
- **提醒**：頁面 `showReminder()`、`answerReminder(action)`、`api.onReminder`、`api.onReminderCancel`；主程式 `askReminder(project)`、`flushReminders()`（頁面還沒載入好時先排著，載入完再送）、`finishReminder(reqId, action)`。
- **HTTP API**（`main.js` 的 `startServer()`）：`GET /ping`、`POST /session-start { cwd, source }`、`POST /get { cwd }`、`POST /update { cwd, progress?, next?, name?, done? }`。port 是 `PROJECT_NOTES_PORT` 環境變數或 47321，`client.js` 和 `main.js` 要一致。
