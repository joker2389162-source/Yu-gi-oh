import { RULES, TURN_STEPS } from './rules.js';

// ============================================================================
// 對戰引擎（Game）。設計原則：
//  - 這是「權威」邏輯：server 端用它跑連線對戰的真正判定，client 端也用同一份
//    程式碼跑單機 PvE / 本機雙人，確保規則一致、不用維護兩套邏輯。
//  - 為了在「地基」階段先求可玩、可驗證，對戰核心做了以下簡化（皆已在 README
//    標註待校對）：
//      1. 核心（core）不分顏色符號，costSymbols 欄位目前僅供顯示，尚未在此
//         強制驗證顏色需求（官方確切的顏色符號支付規則需要官方規則手冊原文
//         才能校對，目前無法連線取得）。
//      2. Flash 關鍵字卡片可以在任何時候由持有者呼叫 playCard 使用（不模擬
//         完整的優先權／stack timing window）。
//      3. Burst（爆發）機制：卡片可在自己主要步驟覆蓋設置（免費、每回合限
//         1張），達成條件事件時可以翻開發動、之後進卡片棄卻區。
//      4. Bond／Brave 進化等進階機制尚未實作，屬於下一階段擴充項目。
// ============================================================================

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

let uidCounter = 1;
function nextUid() {
  return `u${uidCounter++}`;
}

export class Game {
  constructor(deckDefs, db, { seed } = {}) {
    this.db = db;
    this.log = [];
    this.winner = null;
    this.turnNumber = 1;
    this.stepIndex = 0;
    this.activePlayerIndex = 0;
    this.pendingAttack = null; // { attackerUid, blockerUid }
    this.pendingBurstHint = null; // { ownerIdx, uids } - 剛觸發、還沒被消化的爆發發動機會
    this.burstSetThisTurn = 0;
    this.blockUsedThisTurn = new Set(); // uid 集合：本回合已用掉攔截次數的卡

    this.players = deckDefs.map((deckDef, idx) => this._buildPlayer(deckDef, idx));
  }

  _buildPlayer(deckDef, idx) {
    const deckCardIds = [];
    for (const entry of deckDef.main) {
      for (let i = 0; i < entry.qty; i++) deckCardIds.push(entry.id);
    }
    return {
      index: idx,
      name: deckDef.playerName || `玩家${idx + 1}`,
      deck: shuffle(deckCardIds),
      hand: [],
      field: [], // { uid, cardId, cores:[], summonedTurn, blockedThisTurn }
      burstZone: [], // { uid, cardId }
      cardTrash: [],
      life: 0,
      reserve: 0,
      coreTrash: 0,
    };
  }

  _p(idx) {
    return this.players[idx];
  }

  opponentIndex(idx) {
    return idx === 0 ? 1 : 0;
  }

  get currentStep() {
    return TURN_STEPS[this.stepIndex];
  }

  _drawCard(playerIdx, n = 1) {
    const p = this._p(playerIdx);
    for (let i = 0; i < n; i++) {
      if (p.deck.length === 0) {
        this._endGame(this.opponentIndex(playerIdx), '對手牌組抽空（deck-out）');
        return;
      }
      p.hand.push(p.deck.shift());
    }
  }

  start() {
    for (const p of this.players) {
      p.life = RULES.startingLifeCores;
      p.reserve = RULES.startingReserveCores + RULES.startingSoulCores;
    }
    this._drawCard(0, RULES.startingHandSize);
    this._drawCard(1, RULES.startingHandSize);
    this.log.push({ type: 'game-start' });
    this._runStepEntry();
  }

  _runStepEntry() {
    const step = this.currentStep;
    const active = this.activePlayerIndex;
    if (step === 'draw') {
      this._drawCard(active, RULES.drawPerTurn);
    } else if (step === 'refresh') {
      const p = this._p(active);
      p.reserve += p.coreTrash;
      p.coreTrash = 0;
      for (const c of p.field) c.blockedThisTurn = false;
      for (const c of this._p(this.opponentIndex(active)).field) c.attackedThisTurn = false;
      for (const c of p.field) c.attackedThisTurn = false;
      this.blockUsedThisTurn.clear();
    } else if (step === 'start') {
      this.burstSetThisTurn = 0;
    }
    this.log.push({ type: 'step', step, activePlayer: active, turn: this.turnNumber });
  }

  nextStep() {
    if (this.winner !== null) return;
    this.pendingBurstHint = null;
    this.stepIndex++;
    if (this.stepIndex >= TURN_STEPS.length) {
      this.stepIndex = 0;
      this.activePlayerIndex = this.opponentIndex(this.activePlayerIndex);
      this.turnNumber++;
    }
    this._runStepEntry();
  }

  // ---- 費用支付 ----
  _payCost(playerIdx, amount) {
    const p = this._p(playerIdx);
    if (p.reserve < amount) throw new Error('儲備核心不足，無法支付費用');
    p.reserve -= amount;
    p.coreTrash += amount;
  }

  // ---- 核心步驟：從儲備移1個核心到場上卡片，作為BP加成 ----
  attachCore(playerIdx, targetUid) {
    this.pendingBurstHint = null;
    const p = this._p(playerIdx);
    if (p.reserve < 1) throw new Error('儲備核心不足');
    const target = p.field.find((c) => c.uid === targetUid);
    if (!target) throw new Error('找不到場上目標卡片');
    p.reserve -= 1;
    target.cores.push(1);
    this.log.push({ type: 'attach-core', player: playerIdx, target: targetUid });
  }

  effectiveBp(instance) {
    const card = this.db.getCard(instance.cardId);
    const base = card.bp || 0;
    return base + instance.cores.length * 1000;
  }

  // ---- 主要步驟：從手牌打出卡片 ----
  playCard(playerIdx, handIndex) {
    this.pendingBurstHint = null;
    const p = this._p(playerIdx);
    const cardId = p.hand[handIndex];
    if (!cardId) throw new Error('手牌索引無效');
    const card = this.db.getCard(cardId);

    this._payCost(playerIdx, card.cost);
    p.hand.splice(handIndex, 1);

    if (card.type === 'spirit' || card.type === 'nexus') {
      const instance = { uid: nextUid(), cardId, cores: [], summonedTurn: this.turnNumber, blockedThisTurn: false, attackedThisTurn: false };
      p.field.push(instance);
      this.log.push({ type: 'play', player: playerIdx, cardId, uid: instance.uid });
      if (card.type === 'spirit') {
        const oppIdx = this.opponentIndex(playerIdx);
        const uids = this._fireBurstEvent(oppIdx, 'opponent-spirit-summoned').map((b) => b.uid);
        if (uids.length) this.pendingBurstHint = { ownerIdx: oppIdx, uids };
      }
      return instance;
    }
    // magic：立即結算後進卡片棄卻區（實際效果由呼叫端／AI 依 card.text 自行處理，
    // 引擎本身不做通用效果解析，這是下一階段要補的「效果腳本」系統）。
    p.cardTrash.push(cardId);
    this.log.push({ type: 'play-magic', player: playerIdx, cardId });
    return null;
  }

  // ---- 主要步驟：覆蓋設置爆發卡（免費，每回合限1張） ----
  setBurst(playerIdx, handIndex) {
    this.pendingBurstHint = null;
    if (this.burstSetThisTurn >= RULES.burstSetsPerTurn) {
      throw new Error('本回合已使用過爆發設置次數');
    }
    const p = this._p(playerIdx);
    const cardId = p.hand[handIndex];
    if (!cardId) throw new Error('手牌索引無效');
    const card = this.db.getCard(cardId);
    if (!card.burst) throw new Error('這張卡沒有爆發效果，無法覆蓋設置');
    p.hand.splice(handIndex, 1);
    const instance = { uid: nextUid(), cardId };
    p.burstZone.push(instance);
    this.burstSetThisTurn++;
    this.log.push({ type: 'set-burst', player: playerIdx, cardId, uid: instance.uid });
    return instance;
  }

  // ---- 爆發觸發檢查：事件發生時，符合條件的覆蓋爆發卡可選擇發動 ----
  triggerableBursts(playerIdx, eventName) {
    const p = this._p(playerIdx);
    return p.burstZone.filter((b) => this.db.getCard(b.cardId).burst?.condition === eventName);
  }

  activateBurst(playerIdx, uid) {
    const p = this._p(playerIdx);
    const idx = p.burstZone.findIndex((b) => b.uid === uid);
    if (idx === -1) throw new Error('找不到該爆發卡');
    const [b] = p.burstZone.splice(idx, 1);
    p.cardTrash.push(b.cardId);
    this.log.push({ type: 'activate-burst', player: playerIdx, cardId: b.cardId, uid });
    if (this.pendingBurstHint && this.pendingBurstHint.ownerIdx === playerIdx) {
      this.pendingBurstHint.uids = this.pendingBurstHint.uids.filter((u) => u !== uid);
      if (this.pendingBurstHint.uids.length === 0) this.pendingBurstHint = null;
    }
    return b;
  }

  _fireBurstEvent(playerIdx, eventName) {
    // 回傳可發動清單，實際發動與否交由呼叫端（UI／AI）決定並呼叫 activateBurst。
    return this.triggerableBursts(playerIdx, eventName);
  }

  // ---- 攻擊步驟 ----
  declareAttack(playerIdx, attackerUid) {
    this.pendingBurstHint = null;
    if (playerIdx !== this.activePlayerIndex) throw new Error('現在不是你的回合');
    if (this.currentStep !== 'attack') throw new Error('現在不是攻擊步驟');
    const p = this._p(playerIdx);
    const attacker = p.field.find((c) => c.uid === attackerUid);
    if (!attacker) throw new Error('找不到攻擊者');
    if (attacker.summonedTurn === this.turnNumber) throw new Error('本回合才登場的卡片不能攻擊（召喚昏眩）');
    if (attacker.attackedThisTurn) throw new Error('這張卡本回合已經攻擊過了');
    if (this.pendingAttack) throw new Error('上一次攻擊尚未結算完畢');
    attacker.attackedThisTurn = true;
    this.pendingAttack = { attackerUid, blockerUid: null };
    this.log.push({ type: 'declare-attack', player: playerIdx, uid: attackerUid });
    return this.pendingAttack;
  }

  declareBlock(defenderIdx, blockerUid) {
    if (!this.pendingAttack) throw new Error('目前沒有進行中的攻擊');
    if (blockerUid) {
      const p = this._p(defenderIdx);
      const blocker = p.field.find((c) => c.uid === blockerUid);
      if (!blocker) throw new Error('找不到攔截者');
      const card = this.db.getCard(blocker.cardId);
      const keywords = card.keywords || [];
      if (!keywords.includes('blocker') && !keywords.includes('doubleBlocker')) {
        throw new Error('這張卡沒有 Blocker 能力，不能攔截');
      }
      if (this.blockUsedThisTurn.has(blockerUid)) {
        if (!keywords.includes('doubleBlocker')) throw new Error('這張卡本回合已經攔截過了');
      }
      this.pendingAttack.blockerUid = blockerUid;
    } else {
      this.pendingAttack.blockerUid = null;
    }
    this.log.push({ type: 'declare-block', player: defenderIdx, uid: blockerUid });
    return this._resolveCombat();
  }

  _destroy(playerIdx, uid) {
    const p = this._p(playerIdx);
    const idx = p.field.findIndex((c) => c.uid === uid);
    if (idx === -1) return;
    const [inst] = p.field.splice(idx, 1);
    const card = this.db.getCard(inst.cardId);
    // Encore：可支付1核心讓卡片回手牌而非棄卻區（自動嘗試，核心不足則進棄卻區）
    if ((card.keywords || []).includes('encore') && p.reserve >= 1) {
      p.reserve -= 1;
      p.coreTrash += 1;
      p.hand.push(inst.cardId);
      this.log.push({ type: 'encore-return', player: playerIdx, cardId: inst.cardId });
      return;
    }
    p.cardTrash.push(inst.cardId);
    this.log.push({ type: 'destroy', player: playerIdx, cardId: inst.cardId, uid });
  }

  _resolveCombat() {
    const attackerIdx = this.activePlayerIndex;
    const defenderIdx = this.opponentIndex(attackerIdx);
    const { attackerUid, blockerUid } = this.pendingAttack;
    const atkP = this._p(attackerIdx);
    const defP = this._p(defenderIdx);
    const attacker = atkP.field.find((c) => c.uid === attackerUid);
    const attackerCard = this.db.getCard(attacker.cardId);
    const result = { attackerUid, blockerUid, blocked: false, destroyed: [], lifeLost: 0 };

    if (blockerUid) {
      this.blockUsedThisTurn.add(blockerUid);
      const blocker = defP.field.find((c) => c.uid === blockerUid);
      const atkBp = this.effectiveBp(attacker);
      const defBp = this.effectiveBp(blocker);
      result.blocked = true;
      if (atkBp > defBp) {
        this._destroy(defenderIdx, blockerUid);
        result.destroyed.push(blockerUid);
      } else if (defBp > atkBp) {
        this._destroy(attackerIdx, attackerUid);
        result.destroyed.push(attackerUid);
      } else {
        this._destroy(defenderIdx, blockerUid);
        this._destroy(attackerIdx, attackerUid);
        result.destroyed.push(blockerUid, attackerUid);
      }
    } else {
      const hits = (attackerCard.keywords || []).includes('doubleAttack') ? 2 : 1;
      for (let i = 0; i < hits; i++) {
        if (defP.life <= 0) break;
        defP.life -= 1;
        defP.reserve += 1;
        result.lifeLost += 1;
        const bursts = this._fireBurstEvent(defenderIdx, 'life-reduced');
        if (bursts.length) result.availableBursts = (result.availableBursts || []).concat(bursts.map((b) => b.uid));
      }
      if (result.availableBursts?.length) {
        this.pendingBurstHint = { ownerIdx: defenderIdx, uids: result.availableBursts };
      }
    }

    this.log.push({ type: 'combat-result', ...result });
    this.pendingAttack = null;

    if (defP.life <= 0) {
      this._endGame(attackerIdx, '對手生命核心歸零');
    }
    return result;
  }

  onSpiritSummoned(playerIdx) {
    // 供 UI／AI 在 playCard 召喚精靈後呼叫，觸發對手「opponent-spirit-summoned」爆發檢查
    return this._fireBurstEvent(this.opponentIndex(playerIdx), 'opponent-spirit-summoned');
  }

  _endGame(winnerIdx, reason) {
    this.winner = winnerIdx;
    this.log.push({ type: 'game-end', winner: winnerIdx, reason });
  }

  // ---- 給 UI／AI 用的唯讀狀態快照 ----
  getState(forPlayerIdx = null) {
    const snapshotPlayer = (p, hideHand) => ({
      index: p.index,
      name: p.name,
      deckCount: p.deck.length,
      hand: hideHand ? p.hand.map(() => null) : p.hand,
      handCount: p.hand.length,
      field: p.field.map((c) => ({ ...c, bp: this.effectiveBp(c) })),
      burstZoneCount: p.burstZone.length,
      cardTrash: p.cardTrash,
      life: p.life,
      reserve: p.reserve,
      coreTrash: p.coreTrash,
    });
    return {
      turnNumber: this.turnNumber,
      step: this.currentStep,
      activePlayerIndex: this.activePlayerIndex,
      pendingAttack: this.pendingAttack,
      pendingBurstHint: this.pendingBurstHint,
      winner: this.winner,
      players: this.players.map((p, i) =>
        snapshotPlayer(p, forPlayerIdx !== null && i !== forPlayerIdx)
      ),
    };
  }
}
