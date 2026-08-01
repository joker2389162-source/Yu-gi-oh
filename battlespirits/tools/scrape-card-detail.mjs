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
const SCRAPER_VERSION = '2026-07-26-v4-fix-faq-contamination';

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
//
// 實測結果推翻了先前的假設：dd 的純文字內容裡「沒有」LV1/LV2 這種文字──
// 等級數字在頁面上是用圖示(CSS/圖片)顯示的，cheerio 的 .text() 抓不到，
// 只留下純數字/破折號依序排列，例如：
//   精靈格式："3000 1 5000 3"　→　Lv1: BP3000 貼核心1個／Lv2: BP5000 貼核心3個
//   據點格式："- 0 - 2"　→　Lv1: 無BP值 貼核心0個／Lv2: 無BP值 貼核心2個
// （這是原始 Battle Spirits 的「貼核心升級」機制，示範資料庫目前的引擎還沒
// 實作這個，只先如實記錄）。
function parseLevels(val) {
  // 每兩個「原子」(數字或破折號)算一組(BP, 核心數)，依序就是 Lv1、Lv2...
  const atoms = val.match(/\d+|[-－−]/g) || [];
  const levels = [];
  for (let i = 0; i + 1 < atoms.length; i += 2) {
    const bpTok = atoms[i];
    const coresTok = atoms[i + 1];
    const isDash = /^[-－−]$/.test(bpTok);
    levels.push({ lv: levels.length + 1, bp: isDash ? null : Number(bpTok), cores: Number(coresTok) });
  }
  return levels;
}

function parseDetail(html, cardNo, { debug = false } = {}) {
  const $ = cheerio.load(html);
  const result = { bp: null, levels: [], text: null, image: null, blockIcon: null, workIcon: null, raw_dt_dd: {} };

  const norm = (s) => (s || '').trim();
  const isEmpty = (s) => !s || s === '-' || s === '－' || s === '−';

  // 實測發現：卡片詳細頁面下半段還有「規則問答(FAQ)」區塊，每一則問答本身
  // 也是用同樣的 <dt>問題</dt><dd>答案</dd> 結構呈現，而且問題句子常常會
  // 提到「BP」「効果」這些字（例如「...のLv2効果でそのスピリットをBP+したら
  // 、Lv2効果は発揮できるの？」）。先前的比對規則只檢查標籤「字串裡有沒有
  // 出現」這些關鍵字，沒有檢查出現的位置，導致這些問答內容被誤判成欄位資料，
  // 而且因為它們在 DOM 裡排在真正欄位之後，還會蓋掉真正欄位的正確值
  // （這才是先前「BP解析錯誤」的真正原因，跟 dt/dd 是否重複出現無關——
  // 每個真正欄位的標籤在頁面上其實都只出現一次）。
  // 修正方式：比對規則一律改成「以指定字串開頭」，因為欄位標籤都是這種短
  // 字串，FAQ 問題句都是完整敘述開頭（例如「自分の…」「元々の…」），
  // 不會誤觸這個更嚴格的開頭比對。
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
    const val = vals[0];
    if (/^BP/.test(key)) {
      result.levels = parseLevels(val);
      const withBp = result.levels.find((l) => l.bp !== null);
      result.bp = withBp ? withBp.bp : null;
    } else if (/^(能力|効果|テキスト|カードテキスト)/.test(key) && !isEmpty(val)) {
      result.text = val;
    } else if (/^ブロックアイコン/.test(key) && !isEmpty(val)) {
      result.blockIcon = val;
    } else if (/^作品アイコン/.test(key) && !isEmpty(val)) {
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
    // 少數卡片（例如BS43-RVX01～06）官方頁面本身的card_no參數帶有一個多餘的空格
    // （例如"BS43-RV X01"），跟card_no2/卡圖檔名/alt文字用的乾淨編號不一樣；
    // 如果偵測到這種卡片，_lookupId會記錄官方真正需要的、帶空格的查詢用編號。
    const lookupId = card._lookupId || card.id;
    const url = `https://www.battlespirits.com/cardlist/detail_iframe.php?card_no=${encodeURIComponent(lookupId)}&card_no2=${encodeURIComponent(card.id)}`;
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
