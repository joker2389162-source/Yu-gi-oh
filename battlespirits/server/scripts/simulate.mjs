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

console.log('\n== AI vs AI 模擬對局（進階系統 vs 聖光豐穰）==');
const deckA = startersData.starters.find((s) => s.id === 'STARTER-ADVANCED');
const deckB = startersData.starters.find((s) => s.id === 'STARTER-A');
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
  const awakenEvents = game.log.filter((l) => l.type === 'awaken');
  console.log(`\n轉醒事件次數: ${awakenEvents.length}`);
  if (awakenEvents.length) console.log(awakenEvents);
}

console.log('\n== 手動測試：轉醒（Awakening）====');
{
  const deckAdv = startersData.starters.find((s) => s.id === 'STARTER-ADVANCED');
  const g5 = new Game([deckAdv, startersData.starters.find((s) => s.id === 'STARTER-A')], db);
  g5.start();
  const p0 = g5._p(0);
  const p1 = g5._p(1);
  p0.field.push({ uid: 'awaken-test', cardId: 'DEMO-035', cores: [], summonedTurn: 0, blockedThisTurn: false, attackedThisTurn: false, awakened: false, kourinStack: ['DEMO-035'] });
  console.log('轉醒前 cardId=', p0.field.find((c) => c.uid === 'awaken-test').cardId);
  // 模擬「自己生命核心減少」事件（正常會由 _resolveCombat 觸發，這裡直接呼叫內部方法測試）
  g5._checkAwakenings('life-reduced');
  const after = p0.field.find((c) => c.uid === 'awaken-test');
  console.log('轉醒後 cardId=', after.cardId, 'awakened=', after.awakened, 'bp=', g5.effectiveBp(after));
  if (after.cardId !== 'DEMO-036' || !after.awakened) { console.error('轉醒沒有正確翻面！'); process.exitCode = 1; }

  // 也測試：真的用攻擊造成生命減少，確認自動觸發（不用手動呼叫 _checkAwakenings）
  p0.field.push({ uid: 'awaken-test2', cardId: 'DEMO-035', cores: [], summonedTurn: 0, blockedThisTurn: false, attackedThisTurn: false, awakened: false, kourinStack: ['DEMO-035'] });
  // 讓 g5 進到 p1 的攻擊步驟並攻擊 p0，觸發 p0 的 life-reduced 事件
  while (g5.activePlayerIndex !== 1 || g5.currentStep !== 'attack') g5.nextStep();
  const attacker = p1.field[0];
  if (attacker) {
    g5.declareAttack(1, attacker.uid);
    g5.declareBlock(0, null);
    const after2 = p0.field.find((c) => c.uid === 'awaken-test2');
    console.log('真實攻擊觸發後 cardId=', after2?.cardId, '(應為 DEMO-036)');
    if (after2 && after2.cardId !== 'DEMO-036') { console.error('真實攻擊流程沒有正確觸發轉醒！'); process.exitCode = 1; }
  } else {
    console.log('（p1 場上暫無可攻擊卡片，跳過真實攻擊觸發測試）');
  }
}

console.log('\n== 手動測試：契約卡開局是否直接進手牌 ==');
{
  const g2 = new Game([startersData.starters.find((s) => s.id === 'STARTER-A'), startersData.starters.find((s) => s.id === 'STARTER-B')], db);
  g2.start();
  const p0 = g2.getState(0).players[0];
  console.log('玩家1 開局手牌(應含契約卡 DEMO-014):', p0.hand);
  if (!p0.hand.includes('DEMO-014')) { console.error('契約卡沒有進手牌！'); process.exitCode = 1; }
  if (p0.hand.length !== 5) { console.error(`手牌應為 4(起始)+1(契約)=5 張，實際 ${p0.hand.length} 張`); process.exitCode = 1; }
}

console.log('\n== 手動測試：煌臨（Kourin）====');
{
  const deckAdv = startersData.starters.find((s) => s.id === 'STARTER-ADVANCED');
  const g3 = new Game([deckAdv, startersData.starters.find((s) => s.id === 'STARTER-A')], db);
  g3.start();
  // 手動塞一張 DEMO-001（human）到場上，再塞一張 DEMO-037（kourin）到手牌來測試
  const p = g3._p(0);
  p.field.push({ uid: 'test-target', cardId: 'DEMO-001', cores: [], summonedTurn: 0, blockedThisTurn: false, attackedThisTurn: false, awakened: false, kourinStack: ['DEMO-001'] });
  p.hand.unshift('DEMO-037');
  p.reserve = 10;
  const before = g3.effectiveBp(p.field.find((c) => c.uid === 'test-target'));
  g3.kourinPlace(0, 0, 'test-target');
  const after = p.field.find((c) => c.uid === 'test-target');
  console.log(`煌臨前 cardId=DEMO-001 bp=${before} -> 煌臨後 cardId=${after.cardId} bp=${g3.effectiveBp(after)} stack=${JSON.stringify(after.kourinStack)}`);
  if (after.cardId !== 'DEMO-037') { console.error('煌臨後 cardId 應變成 DEMO-037！'); process.exitCode = 1; }
}

console.log('\n== 手動測試：究極（Ultimate）召喚（跟精靈一樣走一般召喚程序）====');
{
  const deckAdv = startersData.starters.find((s) => s.id === 'STARTER-ADVANCED');
  const g4 = new Game([deckAdv, startersData.starters.find((s) => s.id === 'STARTER-A')], db);
  g4.start();
  const p = g4._p(0);
  p.reserve = 10;

  // 1. 召喚條件是「犧牲2張」的 DEMO-038：條件不足時應該噴錯誤
  p.hand.unshift('DEMO-038');
  let threwWithoutSacrifice = false;
  try {
    g4.playCard(0, 0);
  } catch (e) {
    threwWithoutSacrifice = true;
    console.log('（預期行為）沒有犧牲對象時召喚失敗：', e.message);
  }
  if (!threwWithoutSacrifice) { console.error('沒有犧牲對象應該要失敗！'); process.exitCode = 1; }

  // 補2張場上卡片當犧牲對象，再試一次
  p.field.push({ uid: 'sac1', cardId: 'DEMO-001', cores: [], summonedTurn: 0, blockedThisTurn: false, attackedThisTurn: false, awakened: false, kourinStack: ['DEMO-001'] });
  p.field.push({ uid: 'sac2', cardId: 'DEMO-006', cores: [], summonedTurn: 0, blockedThisTurn: false, attackedThisTurn: false, awakened: false, kourinStack: ['DEMO-006'] });
  const inst = g4.playCard(0, 0, { sacrificeUids: ['sac1', 'sac2'] });
  console.log('召喚成功:', inst.cardId, 'BP=', g4.effectiveBp(inst), '場上剩餘卡片數=', p.field.length);
  if (p.field.length !== 1) { console.error('犧牲2張後場上應只剩究極卡本身！'); process.exitCode = 1; }

  // 2. 召喚條件是「自己場上BP需達標」的 DEMO-040：場上沒有高BP卡時應該失敗
  const g5 = new Game([deckAdv, startersData.starters.find((s) => s.id === 'STARTER-A')], db);
  g5.start();
  const p5 = g5._p(0);
  p5.reserve = 10;
  p5.hand.unshift('DEMO-040');
  let threwWithoutBp = false;
  try {
    g5.playCard(0, 0);
  } catch (e) {
    threwWithoutBp = true;
    console.log('（預期行為）場上沒有BP3000+的卡片時召喚失敗：', e.message);
  }
  if (!threwWithoutBp) { console.error('場上沒有高BP卡片時應該要失敗！'); process.exitCode = 1; }
  p5.field.push({ uid: 'big1', cardId: 'DEMO-009', cores: [], summonedTurn: 0, blockedThisTurn: false, attackedThisTurn: false, awakened: false, kourinStack: ['DEMO-009'] }); // BP6000
  const inst5 = g5.playCard(0, 0, {});
  console.log('條件滿足後召喚成功:', inst5.cardId, '場上卡片數=', p5.field.length);
  if (p5.field.length !== 2) { console.error('這次不該犧牲任何卡片，場上應該有2張！'); process.exitCode = 1; }
}

console.log('\n== 手動測試：U觸發（攻擊時棄對手牌庫頂並比較費用）====');
{
  const deckAdv = startersData.starters.find((s) => s.id === 'STARTER-ADVANCED');
  const g6 = new Game([deckAdv, startersData.starters.find((s) => s.id === 'STARTER-A')], db);
  g6.start();
  const p0 = g6._p(0);
  const p1 = g6._p(1);
  p0.field.push({ uid: 'ult1', cardId: 'DEMO-038', cores: [], summonedTurn: 0, blockedThisTurn: false, attackedThisTurn: false, awakened: false, kourinStack: ['DEMO-038'] }); // cost 6
  p1.deck.unshift('DEMO-001'); // cost 1 < 6，應該命中
  while (g6.activePlayerIndex !== 0 || g6.currentStep !== 'attack') g6.nextStep();
  const handCountBefore = p0.hand.length; // 一定要在攻擊步驟才抓，避免把回合中的抽牌步驟也算進去
  g6.declareAttack(0, 'ult1');
  console.log('pendingUTriggerResult:', g6.pendingUTriggerResult);
  if (!g6.pendingUTriggerResult || !g6.pendingUTriggerResult.hit) { console.error('這次應該要命中（對手牌庫頂費用比究極卡低）！'); process.exitCode = 1; }
  if (p0.hand.length !== handCountBefore + 1) { console.error('命中後應該要抽1張牌！'); process.exitCode = 1; }
  g6.declareBlock(1, null);

  // 換一次不會命中的情境：對手牌庫頂放費用比較高的卡
  const g7 = new Game([deckAdv, startersData.starters.find((s) => s.id === 'STARTER-A')], db);
  g7.start();
  const q0 = g7._p(0);
  const q1 = g7._p(1);
  q0.field.push({ uid: 'ult2', cardId: 'DEMO-038', cores: [], summonedTurn: 0, blockedThisTurn: false, attackedThisTurn: false, awakened: false, kourinStack: ['DEMO-038'] });
  q1.deck.unshift('DEMO-038'); // cost 6，跟攻擊方同費用，同費用不算命中
  while (g7.activePlayerIndex !== 0 || g7.currentStep !== 'attack') g7.nextStep();
  g7.declareAttack(0, 'ult2');
  console.log('同費用情境 pendingUTriggerResult:', g7.pendingUTriggerResult);
  if (g7.pendingUTriggerResult.hit) { console.error('同費用不應該算命中！'); process.exitCode = 1; }
}
