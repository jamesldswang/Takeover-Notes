# 📝 接管筆記 Takeover Notes

**版本：1.1.1**　｜　[下載最新版](https://github.com/jamesldswang/Takeover-Notes/releases/latest)

記錄每一個在 Claude Code 開發的專案：**① 現在的進度**、**② 下一步**。程式常駐在系統匣，按 **Ctrl+Alt+N** 叫出快速切換，選專案就直接開啟 Claude Code。

下次在 Claude Code 打開某個專案時，App 會自動跳出來，提醒你上次留下的下一步，並問你要不要**立刻執行**。換一台電腦也能接著做。

---

## 安裝（任何一台 Windows 電腦）

> 系統需求：Windows 10／11 64 位元，已安裝 [Claude Code](https://claude.com/claude-code)。**不需要安裝 Node.js。**

1. 到 [Releases](https://github.com/jamesldswang/Takeover-Notes/releases/latest) 下載 `TakeoverNotes-1.1.1-win-x64.zip`，按右鍵選「解壓縮全部」，放到固定的位置（例如 `C:\Tools\TakeoverNotes`）。
2. 打開資料夾，雙擊 **`接管筆記.exe`**。畫面上不會跳出視窗，請看右下角系統匣有沒有出現黃色便條紙圖示。
3. 按 **Ctrl+Alt+N**，上方會出現黃色提示「還沒連接 Claude Code」，按 **連接**。
   這會在 Claude Code 的設定（`%USERPROFILE%\.claude\settings.json`）加上接管筆記的 hook（SessionStart：開啟時提醒；UserPromptSubmit／Stop／SessionEnd：在背景告訴 App 專案有沒有在動，給閒置提醒用），原本的設定都會保留，改之前也會備份成 `settings.json.takeover-notes.bak`。
4. 建議在系統匣圖示按右鍵，勾選 **開機自動啟動**。

> 資料夾裡的檔案都要一起保留，不能只複製 `接管筆記.exe` 一個檔案。
>
> 之後如果搬了資料夾，Ctrl+Alt+N 會提示「Claude Code 連接的是別的位置」，按 **重新連接** 就好；開機自動啟動也要重新勾一次。
>
> 如果 Windows 跳出「Windows 已保護您的電腦」，點「其他資訊」再點「仍要執行」。

---

## 在另一台電腦接續工作

筆記可以跟著你換電腦，有兩種方式：

| 方式 | 怎麼做 | 適合 |
|------|--------|------|
| **同步資料夾（推薦）** | 兩台電腦都按 ⚙ 設定 →「資料位置」→「更改資料夾…」，選 **OneDrive／Dropbox／Google 雲端硬碟** 裡的同一個資料夾。之後在任一台電腦改的筆記，幾秒內就會出現在另一台 | 兩台電腦會輪流用 |
| **匯出／匯入** | 舊電腦按 ⚙ 設定 →「匯出…」存成 `.json`，用隨身碟或 Email 帶過去；新電腦按「匯入…」 | 一次性搬家 |

- 兩種方式都是**合併**，不會覆蓋：兩邊各自新增的專案都會留下；同一個專案兩邊都改過，取比較新的內容，完成紀錄合在一起；刪除也會同步。
- **兩台電腦的資料夾路徑不一樣也沒關係。** 在新電腦用 Claude Code 打開專案時，App 會用以下順序認出是同一個專案，並記下這台電腦的路徑：
  1. 路徑相同（或在專案的子資料夾裡）
  2. **git remote 相同**（例如兩台都從 GitHub clone 同一個 repo）
  3. 在**使用者資料夾底下的位置相同**（例如兩台都是 `C:\Users\<名字>\ClockApp`）
- 如果同一個專案已經在兩台電腦各被記成一筆（例如舊專案還沒記 git remote，另一台用不同名字新增了一份），App 查到兩筆的 git remote 相同時會**自動併成一筆**，保留原本取的名稱，進度、下一步和路徑都會留下。
- 在快速切換裡，這台電腦還找不到資料夾的專案會標示「這台電腦找不到」。把這台電腦上的資料夾路徑貼到搜尋框按 Enter，或用 Claude Code 打開那個資料夾，就會接上。
- 「接續上次對話」（Shift+Enter）用的是 Claude Code 自己的對話紀錄，那個只存在原本的電腦上；換電腦後請用一般的 Enter 開啟，Claude 會從筆記拿到「現在的進度」和「下一步」。

---

## 功能

| 區塊 | 說明 |
|------|------|
| ⚡ 快速切換（Ctrl+Alt+N 一叫出來就是這個） | 小視窗、搜尋框已經在等你打字：輸入專案名稱過濾，**↑↓** 選擇，**Enter** 在那個資料夾開一個新的 Claude Code 視窗，**Shift+Enter** 開啟並接續上次的對話（`claude --continue`），**Tab** 看這個專案的完整筆記，**Del** 或選中那一列的 🗑 刪除專案（會先確認），**Esc** 關閉。每個專案顯示下一步（黃色）和上次開啟時間。直接**貼上資料夾路徑**按 Enter，會把它加成新專案（或接上已有的專案）並開啟 Claude Code |
| 專案清單（完整筆記左側） | 所有專案，最近開啟的排最前面。上方可以搜尋（名稱、路徑、進度、下一步都搜得到）。關閉提醒的專案會顯示 🔕 |
| 自動加入 | 在 Claude Code 打開任何資料夾，就會自動加進清單（使用者資料夾本身除外）。在專案的子資料夾開啟也算同一個專案 |
| 手動新增 | 完整筆記右上角「＋ 新增專案」，輸入資料夾路徑和名稱 |
| 刪除專案 | 快速切換選中專案按 **Del**（或按那一列的 🗑），也可以在完整筆記右下角按「刪除專案」。會先跳出確認，Enter 刪除、Esc 取消。只刪筆記，不會動到專案資料夾；用同步資料夾的話，另一台電腦也會一起刪掉 |
| 專案內容（完整筆記右側） | 名稱（可以直接改）、路徑（📂 用檔案總管打開、▶ Claude Code、↻ 接續上次對話）、① 現在的進度、② 下一步、完成紀錄。打字會自動儲存 |
| ✓ 這一步完成了 | 把目前的「下一步」移到完成紀錄（記下日期），清空讓你寫新的下一步 |
| 開啟提醒 | 在 Claude Code 開啟（或 resume）專案、而且有「下一步」時，視窗跳出：顯示進度和下一步（下一步可以先修改），按 **▶ 立刻執行** 或 **稍後再說**。90 秒沒回應就當成稍後。每個專案可以取消勾選「在 Claude Code 開啟這個專案時提醒我下一步」 |
| 立刻執行 | Claude 會收到「使用者要立刻執行這個下一步」；在 Claude Code 隨便輸入一句（例如「開始」）就會動工。同時把「開始執行下一步：…」複製到剪貼簿，也可以直接 Ctrl+V 貼上 |
| Claude 自動記 | 每次開啟專案，Claude 都會拿到這個專案的進度和下一步，並被要求：**每做完一段工作、停下來等你之前，不用問就自動把「現在進度」和「建議下一步」寫回接管筆記**（下一步做完了會順便記進完成紀錄）。只是回答問題就不會改 |
| ⏰ 閒置提醒 | Claude 停下來之後，專案 **30 分鐘**沒動（沒有再送訊息、也沒關掉 Claude Code），而且這一輪筆記沒被更新過，就跳出「下一步要記在接管筆記嗎？」，已經先填好 Claude 最後回覆裡的「建議下一步」，可以修改後按 **📝 記下來** 或 **不用**。這個提醒會一直留著直到你回答；你回到 Claude Code 繼續做事時會自動收掉。取消勾選專案的「提醒我下一步」也會關掉閒置提醒 |
| ⚙ 設定 | 連接／中斷 Claude Code、資料位置（同步資料夾）、匯出／匯入 |

### App 行為

- **Ctrl+Alt+N**：叫出快速切換，或隱藏視窗。視窗會出現在滑鼠所在螢幕的正中央。在快速切換按 Tab 或「📋 管理筆記」進入完整筆記；完整筆記按 Esc 或「⚡ 快速切換」回來。
- 從 App 開啟 Claude Code 後，視窗會自動收起來；如果這個專案有下一步，開啟後馬上會跳出提醒。
- 點視窗以外的地方，或點左上角的紅點、黃點，視窗會隱藏，但程式繼續在背景跑。
- 資料預設存在 `%APPDATA%\接管筆記\notes.json`，可以在設定裡改到同步資料夾。
- Claude Code 開啟專案時如果 App 沒在跑，會自動把它啟動。
- 版號顯示在左上角紅綠燈旁邊，系統匣圖示的提示和右鍵選單也看得到。
- 系統匣圖示：
  - **左鍵**：叫出或隱藏快速切換
  - **右鍵**：快速切換專案、管理筆記、設定、連接 Claude Code（打勾）、開機自動啟動（打勾）、結束
- 從 1.0.0 之前的「專案筆記」升級：第一次啟動會自動把 `%APPDATA%\專案筆記` 的資料搬過來，Claude Code 的舊 hook 按「重新連接」就會換掉。

### 命令列

App 資料夾裡的 `接管筆記.exe` 加上 `--cli` 就是命令列工具（不需要 Node.js）：

```bash
"C:/Tools/TakeoverNotes/接管筆記.exe" --cli                                # 顯示目前資料夾的專案筆記
"C:/Tools/TakeoverNotes/接管筆記.exe" --cli --progress "登入頁完成" --next "串接 API"
"C:/Tools/TakeoverNotes/接管筆記.exe" --cli --done --next "寫測試"         # 下一步完成，設定新的下一步
"C:/Tools/TakeoverNotes/接管筆記.exe" --cli --cwd C:/Users/me/MyApp ...    # 指定專案資料夾
```

通常不用自己打：Claude 開啟專案時就會拿到這個指令，請它「更新接管筆記」即可。

---

## 從原始碼執行與開發

需要 [Node.js](https://nodejs.org/)（18 以上）。

```bash
git clone https://github.com/jamesldswang/Takeover-Notes.git
cd Takeover-Notes
npm install
npm install-scripts approve electron   # npm 預設擋 postinstall，第一次要做
npm rebuild electron
npm start                              # 從原始碼執行（或雙擊 start.vbs，要先改裡面的路徑）
npm run dist                           # 打包成 dist/TakeoverNotes-<版號>-win-x64/ 和同名 .zip
```

測試（執行前先關掉正在跑的 App；測試用獨立的暫存資料、Claude Code 設定和 port，不會動到你的筆記）：

```bash
node tools/store-test.js                                                             # 資料合併、換電腦認專案
./node_modules/electron/dist/electron.exe tools/run-in-app.js tools/example-test.js     # 提醒流程
./node_modules/electron/dist/electron.exe tools/run-in-app.js tools/launcher-test.js    # 快速切換
./node_modules/electron/dist/electron.exe tools/run-in-app.js tools/portable-test.js    # 連接 Claude Code、同步資料夾
./node_modules/electron/dist/electron.exe tools/run-in-app.js tools/idle-test.js        # 自動更新指示、閒置提醒、四個 hook
```

修改這個 App 的細節（流程、踩過的坑）寫在 `.claude/skills/takeover-notes/SKILL.md`，用 Claude Code 開這個資料夾時會自動參考。

### 發布新版

先在下面「版本紀錄」加上新版本的段落，並把 `package.json` 的版號改好，執行 `npm run dist` 之後再執行：

```bash
bash tools/release.sh
```

會建立 `v<版號>` 的 Release，說明文字取自版本紀錄裡該版本的段落，並上傳 zip。GitHub 登入資料沿用 git 已存的帳密。

> **為什麼不打包成單一個 .exe？** Windows 11 的「智慧型應用程式控制」會擋下沒有數位簽章、內容又不是 Windows 認得的程式。單一 `.exe` 的打包工具會改動 Electron 主程式，所以會被擋。`build.js` 直接沿用原版 Electron 主程式，只改檔名、內容不變，所以可以正常執行。

### 專案結構

```
Takeover-Notes/
├── notes.html        # 畫面：HTML、CSS、JS 都在這裡（也可以直接用瀏覽器打開，改存 localStorage）
├── main.js           # Electron 主程式：視窗、快捷鍵、系統匣、資料檔與同步、本機 HTTP、提醒、開啟 Claude Code
├── store.js          # 資料操作：比對專案、合併兩份資料（換電腦／同步用）
├── claude-setup.js   # 把 hook 寫進／移出 Claude Code 的 settings.json
├── preload.js        # 版號、紅黃點隱藏、提供 window.__notesApp
├── hook.js           # Claude Code hook（接管筆記.exe --hook）：開啟提醒、閒置提醒用的活動回報
├── cli.js            # 命令列更新筆記（接管筆記.exe --cli）
├── client.js         # hook.js / cli.js 共用：連線到 App，App 沒開就啟動
├── build.js          # 打包腳本
├── tools/            # 測試工具、發布腳本
└── start.vbs         # 從原始碼啟動
```

---

## 已知限制

- **快捷鍵不能用 Fn。** Fn 鍵是筆電鍵盤韌體自己處理的，Windows 收不到。
- **「立刻執行」不會自己按 Enter。** Claude Code 的 SessionStart hook 只能提供脈絡，沒辦法替你送出第一則訊息，所以還是要在 Claude Code 輸入一句（或貼上剪貼簿）。
- **自動記錄靠 Claude 照指示做。** 進度和下一步是 Claude 依照開啟時拿到的指示寫的，偶爾可能漏掉；漏掉的話 30 分鐘後的閒置提醒會補問。閒置提醒的建議是從 Claude 最後一則回覆裡找「下一步」那一段，找不到就沿用原本的下一步。
- **閒置提醒要先「重新連接」。** 1.0.1 以前連接的只有 SessionStart hook，更新後 Ctrl+Alt+N 會提示「連接的是別的位置」，按 **重新連接** 才會加上新的 hook。App 沒開著的時候不會記錄專案有沒有在動。
- **同步是「最後修改的贏」。** 兩台電腦在同一個專案、同一時間都改了文字，會留下比較晚改的那份（完成紀錄不會遺失）。
- 開啟 Claude Code 用的是命令提示字元視窗（`cmd` 的 `start`）。`claude` 優先用 `%USERPROFILE%\.local\bin\claude.exe`，找不到才用 PATH。
- 本機 HTTP 用 port **47321**，只聽 127.0.0.1，而且拒絕瀏覽器發出的請求。

---

## 版本紀錄

### 1.1.1（2026-11-11）

- **快速切換可以刪除專案**：選中專案按 **Del**，或按那一列的 🗑。搜尋框游標不在最後面時，Del 照常刪字。確認視窗預設停在「刪除」，Enter 確定、Esc 取消。

### 1.1.0（2026-11-10）

- **Claude 自動更新接管筆記**：開啟專案時給 Claude 的指示改成「每做完一段工作、停下來之前，不用問就把現在進度和建議下一步寫回筆記」，不用再自己說「幫我更新」。
- **⏰ 閒置 30 分鐘提醒**：Claude 停下來後專案 30 分鐘沒動、筆記也沒更新，就跳出提醒問下一步要不要記下來，並預先填好 Claude 回覆裡的「建議下一步」。
- 連接 Claude Code 時多加 UserPromptSubmit、Stop、SessionEnd 三個背景（async）hook，不會拖慢 Claude Code。舊版連接的要按一次「重新連接」。

### 1.0.1（2026-11-05）

- 修正：換電腦後，在另一台電腦開啟或貼上同一個 repo 的資料夾，會多出一筆不同名字的專案（例如「時鐘」變成兩筆，另一筆叫「Clock」）。原因是 1.0.0 之前建立的專案沒有記 git remote，認不出來。
- 現在 App 啟動、同步讀到別台電腦的資料、更換資料夾時，會替還沒記 git remote 的專案補上，並把 git remote 相同的重複專案自動併成一筆（保留原本的名稱，進度、下一步、完成紀錄和各台電腦的路徑都會留下）。被併掉的那筆會留下刪除紀錄，另一台電腦還在跑舊版也不會把它加回來。

### 1.0.0（2026-11-05）

- 第一版：記錄每個 Claude Code 專案的**現在進度**、**下一步**、完成紀錄，可以搜尋。
- **Ctrl+Alt+N 快速切換**：搜尋專案，Enter 直接在那個資料夾開啟 Claude Code（Shift+Enter 接續上次對話），也可以貼路徑開新資料夾。
- **開啟專案時提醒**：在 Claude Code 開啟專案時自動記錄；有下一步就跳出提醒，可以修改後「立刻執行」。
- **一鍵連接 Claude Code**：App 裡按「連接」就會設定好 hook，不需要手動改設定檔，也不需要安裝 Node.js。
- **換電腦接續工作**：資料可以放在 OneDrive 等同步資料夾自動合併，或匯出／匯入；不同電腦的不同路徑會用 git remote 或使用者資料夾底下的位置認出同一個專案。
- 命令列 `接管筆記.exe --cli`，Claude 可以直接更新筆記。
- 系統匣常駐、開機自動啟動選項。
