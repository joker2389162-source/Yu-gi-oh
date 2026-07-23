# Battle Spirits 線上卡牌遊戲（地基版 / 開發中）

一個以「標準賽（Standard）／永恆賽（Eternal，舊稱大師賽 Master）／無制限（自由對戰）」三種賽制為
基礎打造的 Battle Spirits 線上對戰系統：規則引擎、卡片資料庫、卡組編輯器、單機對電腦（AI）、
本機雙人（同螢幕輪流）、以及可自架的 WebSocket 連線對戰伺服器。

**這是「地基」版本，不是完整上線版本。** 請詳讀下面「目前的限制」再使用/擴充。

## 目前的限制（開始使用前務必先看）

1. **卡片資料不是官方完整現行卡表。**
   `shared/data/cards.json` 裡的 34 張卡是為了讓引擎、卡組編輯器、對戰系統可以完整運作而做的
   **系統示範卡池**，卡名／效果文字都是原創占位內容，不是任何官方 Battle Spirits 卡片的逐字
   重製。這個開發環境的網路政策會擋掉 `battlespirits.com`（連 WebFetch 都連不上，並非只擋
   自動化爬蟲），所以沒辦法自動把官網「現行所有可用卡＋所有合作卡」爬下來收錄。
   要換成真正的官方現行卡表，把資料改寫成同樣的欄位格式（見 `cards.json` 內的 `schema` 說明）
   覆蓋掉示範資料即可，引擎本身不用改。
2. **合作卡（collab）目前只有 1 組虛構示範聯名**（`DEMO-COLLAB-01`，「銀河守護隊」），
   刻意用假的 IP 名稱，不代表任何真實作品的合作卡。要收錄真正的官方合作卡，一樣是往
   `cards.json` / `sets.json` 加資料即可，資料結構已經支援 `collab` / `collabSeries` 欄位。
3. **禁限卡表／輪替日期是從公開規則摘要整理，未逐字核對官方原文**（`shared/data/banlist.json`、
   `shared/data/sets.json` 的 `standardRotation.cutoffDate`），請對照官方最新公告校正。
4. **規則引擎做了幾個簡化**（詳見 `shared/engine/game.js` 開頭註解）：
   - 核心（core）不分顏色符號，卡片的 `costSymbols` 欄位目前只作顯示用，尚未強制驗證顏色需求。
   - Flash 關鍵字卡片可以隨時由持有者打出，沒有完整模擬優先權／stack 的介入時機窗口。
   - Bond／Brave 進化等進階機制尚未實作。
   - 爆發（Burst）機制採用「覆蓋設置、事件觸發後可發動」的現行機制精神，但沒有做到完整的
     連鎖／優先權判定。
5. **AI 是簡單的規則式 AI**（`shared/engine/ai.js`），不是搜尋樹或機率計算，強度有限。
6. **プロデューサーレター vol.21** 的內容目前查不到（搜尋只索引到 vol.12），尚未反映在規則裡；
   若你有連結或截圖內容，直接更新對應的 `shared/data/*.json` 或 `shared/engine/rules.js` 即可。

## 專案結構

```
battlespirits/
  shared/                共用程式碼，client 和 server 都直接 import 同一份，規則只寫一次
    engine/
      rules.js           規則常數（起始核心數、回合步驟…）
      cardDatabase.js    卡片資料索引＋賽制合法性判斷
      format.js          賽制定義（Standard/Eternal/Unlimited）與卡組合法性驗證
      game.js            對戰核心邏輯（權威版本，server 和本機對戰都用它）
      ai.js              簡易規則式 AI
    data/
      cards.json         卡片資料庫（示範資料，見上方限制說明）
      sets.json           系列/彈清單與標準賽輪替設定
      banlist.json        禁止・制限卡表（Standard / Eternal 各自獨立）
      starters.json        現行可用預組（示範版）
  server/                自架用 WebSocket 連線對戰伺服器（Node.js）
    src/index.js
    scripts/simulate.mjs  開發用自我測試（跑一整場 AI vs AI 模擬對局）
  client/                瀏覽器前端（純 ES modules，不需要建置工具）
    index.html
    css/style.css
    js/
      dataLoader.js      載入卡片資料、建立資料庫
      deckStore.js        「我的卡組」本機儲存（localStorage）
      cardsUI.js / cardView.js   卡片資料庫瀏覽/搜尋
      deckUI.js            卡組編輯器（含合法性檢查、預組匯入）
      playUI.js            對戰畫面（單機AI／本機雙人／連線對戰共用同一套UI）
      netClient.js         連線對戰用的 WebSocket client 包裝
      app.js               entry point
```

## 怎麼玩（本機／單機）

不需要任何建置工具，直接用靜態伺服器開啟整個 repo 即可：

```bash
cd Yu-gi-oh
python3 -m http.server 8000
# 瀏覽器開 http://localhost:8000/battlespirits/client/index.html
```

1. 「卡片資料庫」分頁：瀏覽/搜尋示範卡池。
2. 「卡組編輯」分頁：新增卡組、選賽制（標準/永恆/無制限）、從現行預組匯入、逐張調整張數，
   會即時顯示是否合法（40 張下限、同名卡最多 3 張、契約卡最多 1 張、賽制輪替與禁限表）。
3. 「對戰」分頁：
   - 🤖 **單機對電腦**：選你的卡組，對手用示範預組之一。
   - 👥 **本機雙人**：兩人輪流操作同一台裝置（雙方場面都顯示，不做遮蔽，適合面對面）。
   - 🌐 **連線對戰**：見下方「連線對戰」說明。

## 連線對戰（需要自架伺服器）

連線對戰需要你自己啟動 `battlespirits/server`：

```bash
cd Yu-gi-oh/battlespirits/server
npm install
npm start          # 預設監聽 port 8080，可用 PORT=xxxx npm start 改埠號
```

伺服器是**權威端**：所有規則判定（卡組合法性、出牌、攻擊、攔截、爆發…）都在伺服器上用
`shared/engine` 執行，client 只是把操作送過去、畫出伺服器回傳的個人化狀態（會正確隱藏對手
手牌內容，只露出張數）。

前端「連線對戰」分頁填入伺服器的 WebSocket 位址（同機測試用 `ws://localhost:8080`；
部署到雲端主機的話，改成你的網址，例如 `wss://your-domain.com`），一人「建立房間」拿到房號，
另一人輸入房號「加入房間」，兩人到齊自動開局。

若要部署到公開網路：這只是一個普通的 Node.js WebSocket process，可以直接丟到任何支援
Node.js 的主機（VPS、Render、Fly.io、Railway…）上跑 `npm start`；記得開對外的 port，並在
前端網址欄填正確的 `wss://`（有 TLS 的話用 wss，不然用 ws）。

## 開發／測試

```bash
cd battlespirits/server
npm install
npm run simulate     # 載入資料、驗證所有預組合法性、跑一場 AI vs AI 模擬對局，確認引擎沒有炸掉
```

這份「地基」已經過的驗證（純自動化測試，非人工肉眼，若要正式上線建議再找真人多玩幾局）：
- 5 副示範預組（含合作卡預組）都通過合法性檢查（40 張、張數上限、契約卡上限）。
- AI vs AI 模擬對局可以正常跑完、分出勝負，多次重跑沒有出現無限迴圈或例外。
- 瀏覽器端完整跑過一次：卡組編輯→匯入預組→開局→出牌（含負擔不起會正確灰掉）→推進步驟→
  攻擊→對手攔截決策，多回合下來沒有 console 錯誤。
- 連線對戰：兩個獨立瀏覽器分別建房/加入房，狀態（回合、步驟、雙方手牌張數、場面）正確同步，
  出牌動作即時反映到對手畫面。

## 下一步可以做的擴充方向

- 用真正的官方現行卡表／預組取代示範資料（見上方「目前的限制」）。
- 補齊顏色符號（costSymbols）的強制驗證、Bond／Brave 進化機制、更完整的效果腳本系統
  （目前 magic 卡與部分關鍵字效果是用簡化規則手動實作，還沒有通用的效果直譯引擎）。
- 更強的 AI（例如簡單的 minimax / 手牌價值評估）。
- 帳號系統、對戰紀錄、排位配對（目前連線對戰是純房號配對，沒有帳號概念）。

## 版權聲明

Battle Spirits 為 BANDAI 的商標與著作。本專案為原創「地基」開發版，規則依公開規則摘要整理、
卡片資料為系統示範資料（含虛構示範合作卡），僅供學習與系統開發之用，不含任何官方卡片圖像、
逐字卡片文字或官方素材。
