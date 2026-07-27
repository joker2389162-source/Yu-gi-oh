// 把 shared/data/real/<SET>.json 裡已經抓完的真實卡片資料，併入遊戲引擎實際
// 讀取的主資料庫 shared/data/cards.json。這支腳本在沙盒環境本身跑就可以
// （不需要連外網，只是整理本地已經有的 JSON 檔案），跟 scrape-card-detail.mjs
// 不一樣，不用在自己電腦上執行。
//
// 使用方式：node merge-real-set.mjs <系列代碼，例如 26RBS02>
//
// 欄位對應說明：
//   costSymbols 目前固定併入空物件 {}——官方頁面的顏色符號需求是用圖示顯示，
//   scrape-card-detail.mjs 目前還沒解析這個，先如實標記在 missingFields 裡，
//   不要用 {} 當作「無顏色需求」；引擎目前也還沒有真的檢查 costSymbols
//   （只在畫面上顯示），所以先留空不影響對戰功能。
//   bpLevels/blockIcon/workIcon/costAlleviationColor 是官方真實資料才有的
//   額外欄位，示範卡沒有這些欄位（讀取時用 || null / || [] 處理）。

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const setCode = process.argv[2];
if (!setCode) {
  console.error('用法: node merge-real-set.mjs <系列代碼，例如 26RBS02>');
  process.exit(1);
}

const realPath = join(__dirname, '../shared/data/real', `${setCode}.json`);
const cardsPath = join(__dirname, '../shared/data/cards.json');

const real = JSON.parse(readFileSync(realPath, 'utf-8'));
const cardsDb = JSON.parse(readFileSync(cardsPath, 'utf-8'));

const existingIndex = new Map(cardsDb.cards.map((c, i) => [c.id, i]));

let added = 0;
let updated = 0;
let skippedIncomplete = 0;

for (const rc of real.cards) {
  if (rc.bp === null && ['spirit', 'ultimate', 'brave'].includes(rc.type)) {
    // 精靈/究極/ブレイヴ卡沒有BP是資料還沒抓完整，不能拿來對戰，先跳過不併入。
    skippedIncomplete++;
    continue;
  }
  if (rc.cost === null || typeof rc.cost !== 'number') {
    // 費用欄位不是數字（列表頁解析時原樣保留的異常值），資料不完整先跳過。
    skippedIncomplete++;
    continue;
  }

  const missingFields = ['costSymbols']; // 目前唯一已知還沒解析的官方欄位

  const entry = {
    id: rc.id,
    name: rc.name,
    set: rc.set,
    type: rc.type,
    colors: rc.colors,
    cost: rc.cost,
    costSymbols: {},
    bp: rc.bp,
    lv: 1,
    family: rc.family,
    keywords: [],
    burst: null,
    text: rc.text,
    contractCard: rc.contractCard || false,
    token: rc.token || false,
    collab: false,
    collabSeries: null,
    rarity: rc.rarity,
    image: rc.image,
    bpLevels: rc.bpLevels || [],
    blockIcon: rc.blockIcon || null,
    workIcon: rc.workIcon || null,
    costAlleviationColor: rc.costAlleviationColor || null,
    costAlleviationCount: rc.costAlleviationCount || 0,
    missingFields,
  };

  if (existingIndex.has(rc.id)) {
    cardsDb.cards[existingIndex.get(rc.id)] = entry;
    updated++;
  } else {
    cardsDb.cards.push(entry);
    existingIndex.set(rc.id, cardsDb.cards.length - 1);
    added++;
  }
}

writeFileSync(cardsPath, JSON.stringify(cardsDb, null, 2), 'utf-8');
console.log(`完成：${setCode} 併入 shared/data/cards.json。新增 ${added} 張、更新 ${updated} 張、跳過(BP未抓到) ${skippedIncomplete} 張。`);
