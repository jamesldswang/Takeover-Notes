# 📝 專案筆記 Takeover Notes

**版本：1.0.0**　｜　原始碼：<https://github.com/jamesldswang/Takeover-Notes>

記錄每一個在 Claude Code 開發的專案：**① 現在的進度**、**② 下一步**。程式常駐在系統匣，按 **Ctrl+Alt+N** 就會跳出來，再按一次就隱藏。

下次在 Claude Code 打開某個專案時，App 會自動跳出來，提醒你上次留下的下一步，並問你要不要**立刻執行**。

---

## 功能

| 區塊 | 說明 |
|------|------|
| ⚡ 快速切換（Ctrl+Alt+N 一叫出來就是這個） | 小視窗、搜尋框已經在等你打字：輸入專案名稱過濾，**↑↓** 選擇，**Enter** 在那個資料夾開一個新的 Claude Code 視窗，**Shift+Enter** 開啟並接續上次的對話（`claude --continue`），**Tab** 看這個專案的完整筆記，**Esc** 關閉。每個專案顯示下一步（黃色）和上次開啟時間。直接**貼上資料夾路徑**按 Enter，會把它加成新專案並開啟 Claude Code |
| 專案清單（左側） | 所有專案，最近在 Claude Code 開啟的排最前面。顯示名稱、下一步（黃色）、上次開啟時間。上方可以搜尋（名稱、路徑、進度、下一步都搜得到）。關閉提醒的專案會顯示 🔕 |
| 自動加入 | 在 Claude Code 打開任何資料夾，就會自動加進清單（家目錄 `C:\Users\user` 除外）。在專案的子資料夾開啟也算同一個專案 |
| 手動新增 | 右上角「＋ 新增專案」，輸入資料夾路徑和名稱 |
| 專案內容（右側） | 名稱（可以直接改）、路徑（📂 用檔案總管打開、▶ Claude Code、↻ 接續上次對話）、① 現在的進度、② 下一步、完成紀錄。打字會自動儲存 |
| ✓ 這一步完成了 | 把目前的「下一步」移到完成紀錄（記下日期），清空讓你寫新的下一步 |
| 開啟提醒 | 在 Claude Code 開啟（或 resume）專案、而且有「下一步」時，視窗跳出：顯示進度和下一步（下一步可以先修改），按 **▶ 立刻執行** 或 **稍後再說**。90 秒沒回應就當成稍後。每個專案可以取消勾選「在 Claude Code 開啟這個專案時提醒我下一步」 |
| 立刻執行 | Claude 會收到「使用者要立刻執行這個下一步」；在 Claude Code 隨便輸入一句（例如「開始」）就會動工。同時把「開始執行下一步：…」複製到剪貼簿，也可以直接 Ctrl+V 貼上 |
| 讓 Claude 幫你記 | 每次開啟專案，Claude 都會拿到這個專案的進度和下一步。跟 Claude 說「幫我更新專案筆記」，它會用 `cli.js` 寫回來 |

### App 行為

- **Ctrl+Alt+N**：叫出快速切換，或隱藏視窗。視窗會出現在滑鼠所在螢幕的正中央。在快速切換按 Tab 或「📋 管理筆記」進入完整筆記；完整筆記按 Esc 或「⚡ 快速切換」回來。
- 從 App 開啟 Claude Code 後，視窗會自動收起來；如果接好了 hook，而且這個專案有下一步，開啟後馬上會跳出提醒。
- 點視窗以外的地方，或點左上角的紅點、黃點，視窗會隱藏，但程式繼續在背景跑。
- 資料存在 `%APPDATA%\專案筆記\notes.json`，App 重開或電腦重開機都還在。
- Claude Code 開啟專案時如果 App 沒在跑，會自動把它啟動。
- 拖曳視窗頂部的標題列可以移動位置。
- 版號顯示在左上角紅綠燈旁邊，系統匣圖示的提示和右鍵選單也看得到。
- 系統匣圖示：
  - **左鍵**：叫出或隱藏視窗
  - **右鍵**：快速切換專案、管理筆記、開機自動啟動（打勾開啟）、結束

---

## 安裝與執行

> 系統需求：Windows 10／11 64 位元、[Node.js](https://nodejs.org/) 18 以上（Claude Code 的 hook 和 `cli.js` 用 Node 執行）、[Claude Code](https://claude.com/claude-code)。

### 1. 下載並打包

```bash
cd C:/Users/user
git clone https://github.com/jamesldswang/Takeover-Notes.git ProjectNotes
cd ProjectNotes
npm install
npm install-scripts approve electron   # npm 預設擋 postinstall，第一次要做
npm rebuild electron
npm run dist
```

產出 `dist\ProjectNotes-1.0.0-win-x64\`（資料夾）和同名 `.zip`。

> 下面的範例路徑都是 `C:/Users/user/ProjectNotes`。放在別的地方的話，hook 設定和 `start.vbs` 裡的路徑要跟著改。

### 2. 啟動 App

雙擊 `dist\ProjectNotes-1.0.0-win-x64\專案筆記.exe`。畫面上不會跳出視窗，請看右下角系統匣有沒有出現黃色便條紙圖示，然後按 **Ctrl+Alt+N**。建議在系統匣圖示按右鍵，勾選 **開機自動啟動**。

> 資料夾裡的檔案都要一起保留，不能只複製 `專案筆記.exe` 一個檔案。
>
> 如果 Windows 跳出「Windows 已保護您的電腦」，點「其他資訊」再點「仍要執行」。

不打包、直接從原始碼執行：`npm start`，或雙擊 `start.vbs`。

### 3. 接上 Claude Code（開啟專案時提醒）

在 `%USERPROFILE%\.claude\settings.json` 加上 SessionStart hook：

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume",
        "hooks": [
          { "type": "command", "command": "node \"C:/Users/user/ProjectNotes/hook.js\"", "timeout": 120 }
        ]
      }
    ]
  }
}
```

hook 會用 `ProjectNotes` 資料夾裡的程式，所以這個資料夾不要搬走；搬了就改上面的路徑。

### 4. 命令列

```bash
node C:/Users/user/ProjectNotes/cli.js                                 # 顯示目前資料夾的專案筆記
node C:/Users/user/ProjectNotes/cli.js --progress "登入頁完成" --next "串接 API"
node C:/Users/user/ProjectNotes/cli.js --done --next "寫測試"          # 下一步完成，設定新的下一步
node C:/Users/user/ProjectNotes/cli.js --cwd C:/Users/user/MyApp ...   # 指定專案資料夾
```

### 5. 開發與測試

```bash
npm run dist                                                          # 重新打包
./node_modules/electron/dist/electron.exe tools/run-in-app.js tools/example-test.js    # 提醒流程
./node_modules/electron/dist/electron.exe tools/run-in-app.js tools/launcher-test.js   # 快速切換
```

測試用獨立的暫存資料和 port，不會動到你的筆記；執行前先關掉正在跑的 App。修改這個 App 的細節（流程、踩過的坑）寫在 `.claude/skills/project-notes/SKILL.md`，用 Claude Code 開這個資料夾時會自動參考。

---

## 專案結構

```
ProjectNotes/
├── notes.html      # 畫面：HTML、CSS、JS 都在這裡（也可以直接用瀏覽器打開，改存 localStorage）
├── main.js         # Electron 主程式：視窗、快捷鍵、系統匣、資料檔、本機 HTTP、提醒流程
├── store.js        # 資料操作（新增、比對路徑、更新、完成下一步）
├── preload.js      # 版號、紅黃點隱藏、提供 window.__notesApp
├── hook.js         # Claude Code SessionStart hook
├── cli.js          # 命令列更新筆記
├── client.js       # hook.js / cli.js 共用：連線到 App，App 沒開就啟動
├── build.js        # 打包腳本
├── tools/          # 測試工具
└── start.vbs       # 從原始碼啟動
```

---

## 已知限制

- **快捷鍵不能用 Fn。** Fn 鍵是筆電鍵盤韌體自己處理的，Windows 收不到。
- **「立刻執行」不會自己按 Enter。** Claude Code 的 SessionStart hook 只能提供脈絡，沒辦法替你送出第一則訊息，所以還是要在 Claude Code 輸入一句（或貼上剪貼簿）。
- **進度不會自動產生。** 要自己寫，或請 Claude 用 `cli.js` 更新。
- 開啟 Claude Code 用的是一般的命令提示字元視窗（`cmd` 的 `start`），因為這台電腦沒有安裝 Windows Terminal。`claude` 優先用 `%USERPROFILE%\.local\bin\claude.exe`，找不到才用 PATH。
- 本機 HTTP 用 port **47321**，只聽 127.0.0.1，而且拒絕瀏覽器發出的請求。

---

## 版本紀錄

### 1.0.0（2026-11-05）

- 第一版：專案清單、現在的進度、下一步、完成紀錄、搜尋。
- Ctrl+Alt+N 叫出，系統匣常駐，開機自動啟動選項。
- 快速切換：叫出來就是搜尋清單，鍵盤選專案，Enter 直接在那個資料夾開 Claude Code（Shift+Enter 接續上次對話），也可以貼路徑開新資料夾。
- Claude Code SessionStart hook：自動記錄開啟過的專案；有下一步就跳出提醒，可以修改後「立刻執行」。
- `cli.js` 命令列更新筆記。
