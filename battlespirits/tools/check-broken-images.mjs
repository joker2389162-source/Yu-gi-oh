// 在自己電腦上跑（這個repo執行環境連不到battlespirits.com）：
//   cd battlespirits/tools
//   node check-broken-images.mjs
//
// 會讀取 ../shared/data/cards.json 裡所有卡片的 image 網址，逐一送 HEAD 請求檢查是否真的
// 載得出來（跳過DEMO-SET等示範卡，那些本來就沒有image欄位）。跑完會印出：
//   1. 壞掉的卡片清單（可以直接複製代碼去針對這些系列重新抓取）
//   2. 壞掉的卡各自所屬的系列代碼統計，方便決定要重新抓哪幾個系列
//
// 官方伺服器數量一多容易被限流，所以請求之間會間隔一小段時間，量大的話會跑比較久。

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cardsPath = path.join(__dirname, '..', 'shared', 'data', 'cards.json');

const data = JSON.parse(readFileSync(cardsPath, 'utf-8'));
const cards = data.cards.filter((c) => c.image);

console.log(`共 ${cards.length} 張有image欄位的卡片，開始檢查...`);

const broken = [];
const DELAY_MS = 80;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let checked = 0;
for (const card of cards) {
  let ok = false;
  try {
    const res = await fetch(card.image, { method: 'HEAD' });
    ok = res.ok;
  } catch (err) {
    ok = false;
  }
  if (!ok) {
    broken.push({ id: card.id, name: card.name, set: card.set, image: card.image });
  }
  checked++;
  if (checked % 200 === 0) {
    console.log(`已檢查 ${checked}/${cards.length}，目前發現 ${broken.length} 張壞掉`);
  }
  await sleep(DELAY_MS);
}

console.log('\n=== 檢查完成 ===');
console.log(`總計 ${cards.length} 張，壞掉 ${broken.length} 張\n`);

const bySet = {};
for (const c of broken) {
  bySet[c.set] = (bySet[c.set] || 0) + 1;
}
console.log('依系列代碼統計（壞掉張數）：');
for (const [set, count] of Object.entries(bySet).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${set}: ${count}張`);
}

console.log('\n壞掉的卡片清單：');
for (const c of broken) {
  console.log(`  ${c.id}  ${c.name}`);
}

const outPath = path.join(__dirname, 'broken-images-report.json');
writeFileSync(outPath, JSON.stringify(broken, null, 2), 'utf-8');
console.log(`\n完整清單（含圖片網址）已存到 ${outPath}，可以直接把這個檔案傳給我`);
