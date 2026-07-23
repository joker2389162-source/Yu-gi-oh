// 開發用自我測試：載入資料、驗證示範預組合法性、跑一整場 AI vs AI 對局，
// 確認引擎不會拋例外、且遊戲會在有限回合內分出勝負。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createCardDatabase } from '../../shared/engine/cardDatabase.js';
import { validateDeck, FORMATS } from '../../shared/engine/format.js';
import { Game } from '../../shared/engine/game.js';
import { aiRunMainStep, aiRunAttackStep, aiRunCoreStep } from '../../shared/engine/ai.js';
import { TURN_STEPS } from '../../shared/engine/rules.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '../../shared/data');

const cardsData = JSON.parse(readFileSync(join(dataDir, 'cards.json'), 'utf-8'));
const setsData = JSON.parse(readFileSync(join(dataDir, 'sets.json'), 'utf-8'));
const banlistData = JSON.parse(readFileSync(join(dataDir, 'banlist.json'), 'utf-8'));
const startersData = JSON.parse(readFileSync(join(dataDir, 'starters.json'), 'utf-8'));

const db = createCardDatabase({ cardsData, setsData, banlistData });

console.log('== 卡片資料庫 ==');
console.log(`共 ${db.allCards().length} 張卡`);

console.log('\n== 預組合法性驗證 ==');
for (const starter of startersData.starters) {
  const result = validateDeck(starter, db);
  const total = starter.main.reduce((s, e) => s + e.qty, 0);
  console.log(`${starter.name}: ${total}張 -> ${result.valid ? 'OK' : 'FAIL'}`);
  if (!result.valid) {
    console.error(result.errors);
    process.exitCode = 1;
  }
  for (const w of result.warnings) console.log(`  警告: ${w}`);
}

console.log('\n== 賽制定義 ==');
for (const f of Object.values(FORMATS)) console.log(`${f.id}: ${f.label}`);

console.log('\n== AI vs AI 模擬對局 ==');
const deckA = startersData.starters.find((s) => s.id === 'STARTER-A');
const deckB = startersData.starters.find((s) => s.id === 'STARTER-B');
const game = new Game([deckA, deckB], db);
game.start();

let safety = 0;
while (game.winner === null && safety < 2000) {
  safety++;
  const step = game.currentStep;
  const active = game.activePlayerIndex;

  if (step === 'core') {
    aiRunCoreStep(game, active);
  } else if (step === 'main' || step === 'main2') {
    aiRunMainStep(game, active);
  } else if (step === 'attack') {
    aiRunAttackStep(game, active);
  }

  if (game.winner !== null) break;
  game.nextStep();
}

if (game.winner === null) {
  console.error('模擬未在安全回合數內結束，可能有無限迴圈或卡死的邏輯！');
  process.exitCode = 1;
} else {
  const state = game.getState();
  console.log(`勝者: 玩家${game.winner + 1}（${game.players[game.winner].name}）`);
  console.log(`總回合數: ${state.turnNumber}`);
  console.log(`玩家1 生命: ${state.players[0].life} / 玩家2 生命: ${state.players[1].life}`);
  console.log(`模擬步驟安全計數: ${safety}`);
  console.log('\n對局最後 10 筆 log：');
  console.log(game.log.slice(-10));
}
