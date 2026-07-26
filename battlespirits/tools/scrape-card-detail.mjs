// 卡片詳細資料抓取工具 —— 請在你「自己的電腦」上執行，不是在 Claude 的沙盒環境裡
// （那邊連不到 battlespirits.com）。這支腳本會讀取 shared/data/real/<SET>.json 裡
// 已經收錄的卡片清單（card_no），對每一張卡呼叫官方的卡片詳細彈窗端點
// （https://www.battlespirits.com/cardlist/detail_iframe.php?card_no=...），
// 把 BP、效果文字、卡圖網址補進去，寫回同一個檔案。
//
// 用途：個人／非商業性的卡組編輯器開發用途，抓取速度刻意放慢（每張卡間隔數百毫秒），
// 不要拿去做大量、高頻的商業性資料採集。
//
// 使用方式：
//   1. 安裝 Node.js 18 以上版本（https://nodejs.org 下載 LTS 版即可，Windows/Mac都有安裝檔）。
//   2. 在這個資料夾（battlespirits/tools）打開終端機／命令提示字元，執行：
//        npm install cheerio
//        node scrape-card-detail.mjs 26RBS02
//      （26RBS02 是系列代碼，對應 shared/data/real/26RBS02.json；要抓別的系列就換代碼，
//       前提是 shared/data/real/<代碼>.json 裡要先有基本的 card_no 清單）
//   3. 抓完後會直接更新 shared/data/real/26RBS02.json，把結果傳回來給我即可。
//
// 如果官方頁面的HTML結構跟這支腳本猜測的不一樣（每個網站改版時都可能發生)，
// 腳本會在 shared/data/real/_raw/<card_no>.html 留一份原始HTML，把其中1~2個檔案傳給我，
// 我就能照實際結構把解析邏輯改對。

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

// 版本標記：每次改這支腳本都會換一個新字串。執行時第一行印出來的版本字串
// 如果跟你以為下載到的版本對不上，代表你現在執行的其實是「另一份舊檔案」
// （最常見原因：終端機目前所在的資料夾，跟你剛剛下載/覆蓋的檔案不是同一個路徑，
// 之前就發生過 Invoke-WebRequest 存到 Desktop、但終端機在 tools 資料夾底下的狀況）。
// 執行前可以先用 (Get-Item .\scrape-card-detail.mjs).FullName 確認目前資料夾裡
// 這支檔案的完整路徑，跟你下載/覆蓋的路徑是不是同一個。
const SCRAPER_VERSION = '2026-07-26-v3-debug';

const __dirname = dirname(fileURLToPath(import.meta.url));
console.log(`[scrape-card-detail.mjs 版本標記: ${SCRAPER_VERSION}]`);
console.log(`[實際執行的檔案路徑: ${fileURLToPath(import.meta.url)}]`);

const setCode = process.argv[2];
if (!setCode) {
  console.error('用法: node scrape-card-detail.mjs <系列代碼，例如 26RBS02>');
  process.exit(1);
}

const dataPath = join(__dirname, '../shared/data/real', `${setCode}.json`);
if (!existsSync(dataPath)) {
  console.error(`找不到 ${dataPath}，請先確認這個系列已經有基本卡片清單檔案。`);
  process.exit(1);
}

const rawDir = join(__dirname, '../shared/data/real/_raw');
mkdirSync(rawDir, { recursive: true });

const data = JSON.parse(readFileSync(dataPath, 'utf-8'));

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Referer: 'https://www.battlespirits.com/cardlist/',
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 根據使用者實際回報的官方彈窗畫面校正過的解析邏輯：
// カテゴリー/属性/コスト/軽減コスト/系統/BP・コア/能力・効果/ブロックアイコン/作品アイコン
// 這些都是 <dt>標籤</dt><dd>內容</dd> 的配對。
// BP 欄位比較特殊，實際標籤是「BP/コア」，內容是多階段的「LV1 2000 1」「LV2 3000 2」
// （代表：等級1時BP2000、貼到第1個核心；等級2時BP3000、貼到第2個核心——這是原始
// Battle Spirits 的「貼核心升級」機制，示範資料庫目前的引擎還沒實作這個，只先如實記錄）。
function parseLevels(val) {
  // 精靈格式："LV1 2000 1"（等級/BP/核心數）；
  // 據點格式："LV1 - 0"（等級/BP用「-」表示沒有這格資料/核心數）。
  const levels = [];
  const re = /LV\s*(\d+)\s*(?:(\d+)\s+(\d+)|[-－−]\s*(\d+))/g;
  let m;
  while ((m = re.exec(val))) {
    const lv = Number(m[1]);
    if (m[2] !== undefined) {
      levels.push({ lv, bp: Number(m[2]), cores: Number(m[3]) });
    } else {
      levels.push({ lv, bp: null, cores: Number(m[4]) });
    }
  }
  return levels;
}

function parseDetail(html, cardNo, { debug = false } = {}) {
  const $ = cheerio.load(html);
  const result = { bp: null, levels: [], text: null, image: null, blockIcon: null, workIcon: null, raw_dt_dd: {} };

  const norm = (s) => (s || '').trim();
  const isEmpty = (s) => !s || s === '-' || s === '－' || s === '−';

  // 把每個 dt 標籤「所有」出現過的 dd 內容都記錄下來（不是只留第一筆），
  // 因為目前還不確定頁面裡「カード表示／テキスト表示」兩種切換視圖，
  // 哪一份在 DOM 裡真的排在前面——與其用猜的順序規則，不如針對每個
  // 標籤蒐集全部候選內容，再依「哪一份能被正確解析」來挑，比較不會出錯。
  const occurrences = {}; // label -> array of raw dd text
  $('dt').each((_, dt) => {
    const label = norm($(dt).text());
    const dd = $(dt).next('dd');
    if (!label || !dd.length) return;
    const val = norm(dd.text());
    (occurrences[label] = occurrences[label] || []).push(val);
    if (!(label in result.raw_dt_dd)) result.raw_dt_dd[label] = val;
  });

  if (debug) {
    console.log(`  [除錯 ${cardNo}] 所有 dt/dd 標籤與出現次數:`);
    for (const [label, vals] of Object.entries(occurrences)) {
      console.log(`    "${label}" x${vals.length}: ${JSON.stringify(vals)}`);
    }
  }

  for (const [key, vals] of Object.entries(occurrences)) {
    if (/BP/i.test(key)) {
      // 對每一個重複出現的候選內容都嘗試解析，挑「能解析出等級資料」的那一份；
      // 如果好幾份都能解析，用第一份；都解析不出來才落回抓數字的保底邏輯。
      let chosen = null;
      for (const val of vals) {
        const levels = parseLevels(val);
        if (levels.length > 0) { chosen = { val, levels }; break; }
      }
      if (chosen) {
        result.levels = chosen.levels;
        const withBp = chosen.levels.find((l) => l.bp !== null);
        result.bp = withBp ? withBp.bp : null;
      } else {
        const val = vals[0];
        const m2 = val.match(/\d+/);
        if (m2) result.bp = Number(m2[0]);
      }
    }
    const val = vals[0];
    if (/効果|テキスト|カードテキスト/.test(key) && !isEmpty(val)) {
      result.text = val;
    }
    if (/ブロックアイコン/.test(key) && !isEmpty(val)) {
      result.blockIcon = val;
    }
    if (/作品アイコン/.test(key) && !isEmpty(val)) {
      result.workIcon = val;
    }
  }

  // 卡圖：官方卡圖網址規則已經從列表頁確認過是固定格式，直接用卡號組出來，
  // 不用再從 HTML 猜 class 名稱，這樣也比較不會抓錯。
  result.image = `https://www.battlespirits.com/images/cardlist/${cardNo}.webp`;

  return result;
}

// 這幾張卡片是使用者之前傳過官方畫面截圖給我核對過的樣本，抓取時會多印出
// 完整的 dt/dd 除錯資訊，方便對照畫面截圖確認解析邏輯到底對不對。
// 也可以用環境變數 BS_DEBUG_ALL=1 讓「每一張卡」都印出除錯資訊。
const DEBUG_CARD_IDS = new Set(['26RBS02-007', '26RBS02-074']);
const DEBUG_ALL = process.env.BS_DEBUG_ALL === '1';

async function main() {
  console.log(`開始抓取 ${data.cards.length} 張卡片的詳細資料（系列：${setCode}）...`);
  let ok = 0;
  let failed = 0;

  for (let i = 0; i < data.cards.length; i++) {
    const card = data.cards[i];
    const url = `https://www.battlespirits.com/cardlist/detail_iframe.php?card_no=${encodeURIComponent(card.id)}&card_no2=${encodeURIComponent(card.id)}`;
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      writeFileSync(join(rawDir, `${card.id}.html`), html, 'utf-8');

      const detail = parseDetail(html, card.id, { debug: DEBUG_ALL || DEBUG_CARD_IDS.has(card.id) });
      card.bp = detail.bp;
      card.bpLevels = detail.levels; // 完整的多階段BP/核心數資料（原始「貼核心升級」機制）
      card.text = detail.text;
      card.image = detail.image;
      card.blockIcon = detail.blockIcon;
      card.workIcon = detail.workIcon;
      card._rawDtDd = detail.raw_dt_dd; // 除錯用，之後可以刪掉
      card.dataComplete = detail.bp !== null;
      if (card.dataComplete) {
        card.missingFields = card.missingFields.filter((f) => !['bp', 'text', 'image'].includes(f));
      }

      ok++;
      console.log(`[${i + 1}/${data.cards.length}] ${card.id} ${card.name} -> BP=${detail.bp}${detail.levels.length > 1 ? `(共${detail.levels.length}階)` : ''} text=${detail.text ? '(有)' : '(無)'}`);
    } catch (err) {
      failed++;
      console.error(`[${i + 1}/${data.cards.length}] ${card.id} 失敗:`, err.message);
    }

    // 禮貌性延遲，不要對官網造成負擔
    await sleep(400);

    // 每 20 張自動存一次檔，就算中途失敗/中斷也不會全部白抓
    if (i % 20 === 0) writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`\n完成。成功 ${ok} 張，失敗 ${failed} 張。結果已寫回 ${dataPath}`);
  console.log(`原始 HTML 存在 ${rawDir}，如果 bp/text 抓到的內容怪怪的，把其中1~2個 .html 檔傳給我看看實際結構。`);
}

main();
