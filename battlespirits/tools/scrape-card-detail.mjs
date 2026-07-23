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

const __dirname = dirname(fileURLToPath(import.meta.url));
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

// 嘗試好幾種常見的 dt/dd 或 class 命名方式來抓 BP／效果文字／卡圖，
// 因為我沒看過詳細彈窗的實際 HTML，只能先猜幾種常見寫法，抓不到時會保留 raw HTML 供你回報。
function parseDetail(html, cardNo) {
  const $ = cheerio.load(html);
  const result = { bp: null, text: null, image: null, symbolCost: null, raw_dt_dd: {} };

  // 把所有 dt/dd 配對都記錄下來，方便之後對照調整
  $('dt').each((_, dt) => {
    const label = $(dt).text().trim();
    const dd = $(dt).next('dd');
    if (label && dd.length) {
      result.raw_dt_dd[label] = dd.text().trim();
    }
  });

  // 常見 BP 標籤猜測
  for (const key of Object.keys(result.raw_dt_dd)) {
    if (/^BP$|戦闘力|パワー/.test(key)) {
      const m = result.raw_dt_dd[key].match(/\d+/);
      if (m) result.bp = Number(m[0]);
    }
    if (/効果|テキスト|カードテキスト/.test(key)) {
      result.text = result.raw_dt_dd[key];
    }
    if (/コアシンボル|シンボル/.test(key)) {
      result.symbolCost = result.raw_dt_dd[key];
    }
  }

  // class 名稱猜測（bpVal / textVal / effectText 之類）
  if (!result.bp) {
    const bpEl = $('.bpVal, .bp, .power').first();
    if (bpEl.length) {
      const m = bpEl.text().match(/\d+/);
      if (m) result.bp = Number(m[0]);
    }
  }
  if (!result.text) {
    const textEl = $('.textVal, .effectText, .cardText, .effect').first();
    if (textEl.length) result.text = textEl.text().trim();
  }

  const img = $('img.cardImg, .thumbnail img, img[alt="' + cardNo + '"]').first();
  if (img.length) result.image = img.attr('data-src') || img.attr('src') || null;

  return result;
}

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

      const detail = parseDetail(html, card.id);
      card.bp = detail.bp;
      card.text = detail.text;
      card.image = detail.image;
      card._rawDtDd = detail.raw_dt_dd; // 除錯用，之後可以刪掉
      card.dataComplete = detail.bp !== null && detail.text !== null;
      if (card.dataComplete) {
        card.missingFields = card.missingFields.filter((f) => !['bp', 'text'].includes(f));
      }

      ok++;
      console.log(`[${i + 1}/${data.cards.length}] ${card.id} ${card.name} -> BP=${detail.bp} text=${detail.text ? '(有)' : '(無)'}`);
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
