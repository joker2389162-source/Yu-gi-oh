// 簡易規則式 AI（非搜尋樹、非機率計算），用來讓「單機對電腦」可以真的玩起來。
// 之後要做更強的 AI，可以在不改變 Game 介面的前提下，替換這個檔案的策略邏輯。

function affordableHandCards(game, playerIdx) {
  const p = game._p(playerIdx);
  return p.hand
    .map((cardId, handIndex) => ({ cardId, handIndex, card: game.db.getCard(cardId) }))
    .filter(({ card }) => card.cost <= p.reserve);
}

// 主要步驟：盡量打出手牌（先打生物/據點，優先打得起的最貴卡，最後用剩餘核心打魔法），
// 並在還沒設置過爆發卡時，若手上有爆發卡就設置一張。
export function aiRunMainStep(game, playerIdx) {
  const actions = [];
  let guard = 0;
  while (guard++ < 20) {
    const p = game._p(playerIdx);
    const playable = affordableHandCards(game, playerIdx)
      .filter(({ card }) => card.type === 'spirit' || card.type === 'nexus')
      .sort((a, b) => b.card.cost - a.card.cost);
    if (playable.length === 0) break;
    const choice = playable[0];
    game.playCard(playerIdx, choice.handIndex);
    actions.push({ action: 'play', cardId: choice.cardId });
    aiAutoResolveBurst(game, playerIdx);
  }

  // 究極卡：跟精靈一樣走一般召喚程序，只是可能要滿足召喚條件（見 game.js 的
  // _checkSummonCondition）。條件不符時 playCard 會丟例外，這裡直接跳過該張卡。
  guard = 0;
  while (guard++ < 10) {
    const p = game._p(playerIdx);
    const candidates = affordableHandCards(game, playerIdx).filter(({ card }) => card.type === 'ultimate');
    if (candidates.length === 0) break;
    const choice = candidates[0];
    let sacrificeUids = [];
    if (choice.card.summonCondition?.type === 'sacrifice') {
      const need = choice.card.summonCondition.value;
      if (p.field.length < need) break; // 場上卡片不夠犧牲，跳過本輪
      sacrificeUids = [...p.field].sort((a, b) => game.effectiveBp(a) - game.effectiveBp(b)).slice(0, need).map((c) => c.uid);
    }
    try {
      game.playCard(playerIdx, choice.handIndex, { sacrificeUids });
      actions.push({ action: 'play-ultimate', cardId: choice.cardId });
      aiAutoResolveBurst(game, playerIdx);
    } catch {
      break; // 召喚條件不符（例如 ownFieldBpAtLeast 不滿足），先跳過
    }
  }

  // 剩餘核心打魔法卡
  guard = 0;
  while (guard++ < 20) {
    const playableMagic = affordableHandCards(game, playerIdx).filter(({ card }) => card.type === 'magic');
    if (playableMagic.length === 0) break;
    const choice = playableMagic[0];
    game.playCard(playerIdx, choice.handIndex);
    actions.push({ action: 'play-magic', cardId: choice.cardId });
  }

  if (game.burstSetThisTurn < 1) {
    const p = game._p(playerIdx);
    const burstIdx = p.hand.findIndex((cardId) => game.db.getCard(cardId).burst);
    if (burstIdx !== -1) {
      const cardId = p.hand[burstIdx];
      game.setBurst(playerIdx, burstIdx);
      actions.push({ action: 'set-burst', cardId });
    }
  }

  return actions;
}

// 攻擊步驟：所有能攻擊、且戰力沒有明顯劣勢的場上卡片都拿去攻擊。
export function aiRunAttackStep(game, playerIdx) {
  const actions = [];
  const p = game._p(playerIdx);
  const defIdx = game.opponentIndex(playerIdx);
  const defField = game._p(defIdx).field;
  const bestOpponentBlockerBp = defField.length
    ? Math.max(...defField.map((c) => game.effectiveBp(c)))
    : 0;

  const attackers = p.field.filter((c) => !c.attackedThisTurn && c.summonedTurn !== game.turnNumber);
  for (const attacker of attackers) {
    const bp = game.effectiveBp(attacker);
    // 太弱、會被輕鬆換掉又打不穿場面的卡就先留著防守
    if (bp < bestOpponentBlockerBp * 0.6 && defField.length > 0) continue;
    game.declareAttack(playerIdx, attacker.uid);
    actions.push({ action: 'attack', uid: attacker.uid });
    aiDecideBlockForOpponent(game, defIdx);
    aiAutoResolveBurst(game, defIdx);
    aiAutoResolveBurst(game, playerIdx);
  }
  return actions;
}

// 當 AI 是防守方時，決定要不要攔截（pendingAttack 存在時呼叫）。
export function aiDecideBlockForOpponent(game, defenderIdx) {
  if (!game.pendingAttack) return null;
  const atkIdx = game.opponentIndex(defenderIdx);
  const attacker = game._p(atkIdx).field.find((c) => c.uid === game.pendingAttack.attackerUid);
  const atkBp = game.effectiveBp(attacker);
  const p = game._p(defenderIdx);

  const candidates = p.field.filter((c) => {
    const card = game.db.getCard(c.cardId);
    const kw = card.keywords || [];
    if (!kw.includes('blocker') && !kw.includes('doubleBlocker')) return false;
    if (game.blockUsedThisTurn.has(c.uid) && !kw.includes('doubleBlocker')) return false;
    return true;
  });

  // 優先選「打得贏或至少換得掉」的攔截者；若沒有就不攔截（保留場面）。
  candidates.sort((a, b) => game.effectiveBp(b) - game.effectiveBp(a));
  const winner = candidates.find((c) => game.effectiveBp(c) >= atkBp);
  const chosen = winner || null;

  const result = game.declareBlock(defenderIdx, chosen ? chosen.uid : null);
  return { blockerUid: chosen ? chosen.uid : null, result };
}

// 爆發觸發時，AI 一律選擇發動（示範策略：能發就發）。
export function aiDecideBurstActivation(game, playerIdx, availableUids) {
  const activated = [];
  for (const uid of availableUids || []) {
    game.activateBurst(playerIdx, uid);
    activated.push(uid);
  }
  return activated;
}

// 若 game.pendingBurstHint 屬於這個 AI，自動發動（能發就發的簡單策略）。
export function aiAutoResolveBurst(game, aiIdx) {
  if (game.pendingBurstHint && game.pendingBurstHint.ownerIdx === aiIdx) {
    return aiDecideBurstActivation(game, aiIdx, [...game.pendingBurstHint.uids]);
  }
  return [];
}

// 核心步驟：若儲備核心>=2，把1個核心貼到場上BP最高的卡片上強化。
export function aiRunCoreStep(game, playerIdx) {
  const p = game._p(playerIdx);
  if (p.reserve < 2 || p.field.length === 0) return null;
  const target = [...p.field].sort((a, b) => game.effectiveBp(b) - game.effectiveBp(a))[0];
  game.attachCore(playerIdx, target.uid);
  return { action: 'attach-core', target: target.uid };
}
