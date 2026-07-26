import { RULES, TURN_STEPS } from './rules.js';

// ============================================================================
// 對戰引擎（Game）。設計原則：
//  - 這是「權威」邏輯：server 端用它跑連線對戰的真正判定，client 端也用同一份
//    程式碼跑單機 PvE / 本機雙人，確保規則一致、不用維護兩套邏輯。
//  - 下面這些機制都已經對照官方《總合規則》《地板規則》《官方規則手冊[STANDARD]/
//    [ETERNAL]》四份規則書核對過（2026-07-26），核對結果同步記錄在 README。
//
// 已對照官方規則書實作／校正的機制：
//   - 能量（core）／BP升級：卡片身上的能量數量是「當前值，可增可減」，不是只能
//     疊加——attachCore（從預備區貼上）／detachCore（移回預備區）／
//     moveCoreBetweenField（在自己場上卡片間互相搬動）都只能在自己的主要階段
//     使用（core／main／main2 步驟，次數不限）。若因此讓卡片的能量數量低於
//     「維持最低Lv所需的能量數量」，卡片會直接消滅（_vanishIfBelowMinLevel，
//     跟戰鬥破壞是不同的離場方式，不會觸發 Encore／契約卡魂狀態這類限定「因對手
//     效果離場」的能力）。召喚/配置時，付完費用後也要另外放置能量達到最低Lv門檻
//     （一般卡Lv1，終極靈魂卡Lv3），這是召喚程序本身的一部分，不是額外的效果。
//     BP門檻表本身見 card.bpLevels；沒有這份資料的卡（目前僅示範卡池）維持
//     「每貼1核心+1000BP、無最低需求」的舊版簡化規則，向下相容。
//   - 軽減コスト（費用減免）：自己場上如果有跟卡片「減輕標誌」同色的標誌，
//     召喚/配置/使用費用會強制折抵（不能選擇不折抵），見 _costAlleviationAmount。
//     目前資料只記錄減輕標誌的顏色，沒有記錄實際張數，先固定折抵1點；
//     「6色任一色」／「究極」專用／「神」專用這幾種特殊減輕標誌還沒有對應資料，
//     暫不支援。
//   - 轉醒（Awakening）：卡片有「轉醒前」「轉醒後」兩個面，事件觸發時自動翻面，
//     翻面不需額外付費（見 card.awakening = { condition, afterId }）。官方規則
//     還有「多張同時滿足時要逐一結算」「翻面時要重新確認能量是否足夠維持最低Lv」
//     兩個細節，這裡還沒實作（低優先：demo資料目前沒有會同時觸發多張轉醒的情境）。
//   - 煌臨（Kourin）：從手牌把卡片疊放到場上一張卡片上，不算是「召喚」（不會觸發
//     「對手精靈召喚」類爆發事件）。不是「付費」，而是移動自己的1點靈魂能量
//     （簡化成消耗1點預備區能量，移到疊放後的卡片身上當額外核心；官方規則的
//     「移到指定特定場所」因為沒有逐卡資料，先預設移到疊放後的卡片上）。疊放
//     對象要滿足的條件見 card.kourin.condition（{type:'family'|'bpAtLeast', value,
//     text}），沒有這個欄位時退回舊資料格式 targetFamily 陣列。若疊放後能量數量
//     不足以維持新卡片最低Lv，煌臨直接失敗（官方規則：無法進行，不是完成後才
//     消滅）。官方規則中煌臨元卡片的「煌臨中」效果會持續繼承，這裡簡化為只記錄
//     疊放歷史（kourinStack），還沒有完整的條件式效果繼承系統。
//   - 究極（Ultimate）：跟精靈一樣走一般召喚程序（付費即可），差別在於卡片可能寫有
//     「召喚條件」（card.summonCondition），沒滿足條件就不能召喚。目前支援
//     type:'always'（無條件）／'sacrifice'（需犧牲自己場上N張卡片）／
//     'ownFieldBpAtLeast'（自己場上需有BP達標的卡片）／'lifeAtMost'（自己生命核心
//     需在門檻以下）幾種條件類型，見 playCard 的 extra.sacrificeUids 參數。官方
//     規則另外規定終極靈魂卡最低Lv是3（見上面能量段落），且場上的終極靈魂卡
//     被視為跟一般靈魂卡不同種類，不會被「以靈魂卡為對象」的效果選中——後者
//     因為引擎還沒有通用的效果目標篩選系統，暫不適用。
//     另外實作了【U觸發】（U-Trigger）：帶有 card.uTrigger 的究極卡攻擊時，會把
//     對手牌庫最上面一張牌送去棄卻區，若那張牌的費用比自己低才算「命中」並發動效果
//     （同費用不算命中，這裡的命中效果先用「抽1張牌」等示範效果呈現）。
//   - 契約（Contract）：契約卡是主卡組40張的一部分（不是額外多1張），一副卡組
//     只能收錄同一種契約卡。開局時可選擇指定其中1張，洗牌前先抽出、開局時改成
//     「抽3張＋公開這1張＝一樣4張起始手牌」（見 _buildPlayer/start()）。契約卡
//     因對手效果離場時，會變成場上的「魂狀態」而不進棄卻區（見 _destroy），
//     但目前沒有任何效果腳本可以把魂狀態的卡復活。
//
// 還沒實作、屬於下一階段擴充項目：Flash 關鍵字的完整優先權／stack timing
// window（目前可隨時打出）、Bond／Brave 進化、BP+/BP-動態效果（沒有這類效果
// 腳本，所以「Lv變動時重算」這件事目前無從測試）。
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
    this.pendingUTriggerResult = null; // 最近一次 U觸發 的結果，供 UI 顯示
    this.burstSetThisTurn = 0;
    this.blockUsedThisTurn = new Set(); // uid 集合：本回合已用掉攔截次數的卡

    this.players = deckDefs.map((deckDef, idx) => this._buildPlayer(deckDef, idx));
  }

  _buildPlayer(deckDef, idx) {
    const deckCardIds = [];
    for (const entry of deckDef.main) {
      for (let i = 0; i < entry.qty; i++) deckCardIds.push(entry.id);
    }
    // 契約卡是主卡組40張的一部分（不是額外多的一張）：洗牌前先抽出1張背面展示，
    // 開局時改成「抽3張＋公開加入這1張＝一樣是4張起始手牌」，見 start()。
    let setAsideContractCardId = null;
    if (deckDef.contractCardId) {
      const pos = deckCardIds.indexOf(deckDef.contractCardId);
      if (pos !== -1) {
        deckCardIds.splice(pos, 1);
        setAsideContractCardId = deckDef.contractCardId;
      }
    }
    return {
      index: idx,
      name: deckDef.playerName || `玩家${idx + 1}`,
      deck: shuffle(deckCardIds),
      setAsideContractCardId,
      hand: [],
      field: [], // { uid, cardId, cores:[], summonedTurn, blockedThisTurn, awakened, kourinStack }
      burstZone: [], // { uid, cardId }
      soulStateZone: [], // { uid, cardId } - 契約卡因對手效果離場後保留的「魂狀態」
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
    for (const p of this.players) {
      const drawCount = p.setAsideContractCardId ? RULES.startingHandSize - 1 : RULES.startingHandSize;
      this._drawCard(p.index, drawCount);
    }
    for (const p of this.players) {
      if (p.setAsideContractCardId) {
        p.hand.push(p.setAsideContractCardId);
        this.log.push({ type: 'contract-to-hand', player: p.index, cardId: p.setAsideContractCardId });
      }
    }
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
    if (step === 'start') this._checkAwakenings('turn-start');
  }

  // ---- 轉醒：掃描雙方場上卡片，符合條件的自動翻面（不需額外付費） ----
  _checkAwakenings(eventName) {
    for (const p of this.players) {
      for (const inst of p.field) {
        if (inst.awakened) continue;
        const card = this.db.getCard(inst.cardId);
        if (card.awakening && card.awakening.condition === eventName) {
          inst.cardId = card.awakening.afterId;
          inst.awakened = true;
          this.log.push({ type: 'awaken', player: p.index, uid: inst.uid, fromId: card.id, toId: card.awakening.afterId });
        }
      }
    }
  }

  nextStep() {
    if (this.winner !== null) return;
    this.pendingBurstHint = null;
    this.pendingUTriggerResult = null;
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

  // ---- 能量（核心）的自由搬動：官方規則已核對確認是「自己的主要階段，
  // 次數不限」，不是限定某個專屬步驟一次性動作。這個引擎的回合流程另外設計了
  // 一個獨立的「core」步驟給這個動作用（示範階段的簡化取捨），所以這裡除了
  // 官方講的 main／main2，也放寬到 core 步驟一併允許，避免跟現有的步驟設計
  // 衝突。 ----
  _assertOwnMainPhase(playerIdx) {
    if (this.activePlayerIndex !== playerIdx) throw new Error('現在不是你的回合，不能搬動能量');
    if (!['core', 'main', 'main2'].includes(this.currentStep)) throw new Error('只能在自己的主要步驟搬動能量');
  }

  // 官方規則書校正：卡片要維持在場上，身上的能量數量不能低於「維持最低Lv
  // 所需的能量數量」，否則會直接消滅（跟戰鬥被破壞是不同的離場方式，不會
  // 觸發【Encore】或契約卡的「魂狀態」等「因對手效果離場」限定的能力）。
  _minCoresRequired(card) {
    if (!Array.isArray(card.bpLevels) || card.bpLevels.length === 0) return 0;
    if (card.type === 'ultimate') {
      // 官方規則：終極靈魂卡的最低Lv是3（一般靈魂卡/據點最低Lv是1）。
      const lv3 = card.bpLevels.find((l) => l.lv === 3);
      if (lv3) return lv3.cores;
      return card.bpLevels[card.bpLevels.length - 1].cores;
    }
    return card.bpLevels[0].cores;
  }

  _vanishIfBelowMinLevel(playerIdx, uid) {
    const p = this._p(playerIdx);
    const inst = p.field.find((c) => c.uid === uid);
    if (!inst) return;
    const card = this.db.getCard(inst.cardId);
    const min = this._minCoresRequired(card);
    if (inst.cores.length < min) {
      const idx = p.field.findIndex((c) => c.uid === uid);
      p.field.splice(idx, 1);
      p.cardTrash.push(inst.cardId);
      this.log.push({ type: 'vanish', player: playerIdx, cardId: inst.cardId, uid, reason: 'below-min-level' });
    }
  }

  // ---- 從儲備移動能量到場上卡片（可一次移動多點） ----
  attachCore(playerIdx, targetUid, amount = 1) {
    this._assertOwnMainPhase(playerIdx);
    this.pendingBurstHint = null;
    const p = this._p(playerIdx);
    if (p.reserve < amount) throw new Error('儲備核心不足');
    const target = p.field.find((c) => c.uid === targetUid);
    if (!target) throw new Error('找不到場上目標卡片');
    p.reserve -= amount;
    for (let i = 0; i < amount; i++) target.cores.push(1);
    this.log.push({ type: 'attach-core', player: playerIdx, target: targetUid, amount });
  }

  // ---- 把場上卡片身上的能量移回儲備區（官方規則校正：能量數量是可增可減的
  // 當前值，不是只能疊加；若移走後低於維持最低Lv所需數量，卡片會直接消滅）----
  detachCore(playerIdx, sourceUid, amount = 1) {
    this._assertOwnMainPhase(playerIdx);
    this.pendingBurstHint = null;
    const p = this._p(playerIdx);
    const source = p.field.find((c) => c.uid === sourceUid);
    if (!source) throw new Error('找不到場上來源卡片');
    if (source.cores.length < amount) throw new Error('這張卡身上的能量不足');
    source.cores.splice(0, amount);
    p.reserve += amount;
    this.log.push({ type: 'detach-core', player: playerIdx, source: sourceUid, amount });
    this._vanishIfBelowMinLevel(playerIdx, sourceUid);
  }

  // ---- 把場上一張卡片身上的能量直接移到另一張卡片身上（不經過儲備區）----
  moveCoreBetweenField(playerIdx, sourceUid, targetUid, amount = 1) {
    this._assertOwnMainPhase(playerIdx);
    this.pendingBurstHint = null;
    const p = this._p(playerIdx);
    const source = p.field.find((c) => c.uid === sourceUid);
    const target = p.field.find((c) => c.uid === targetUid);
    if (!source || !target) throw new Error('找不到場上來源或目標卡片');
    if (source === target) throw new Error('來源跟目標不能是同一張卡');
    if (source.cores.length < amount) throw new Error('這張卡身上的能量不足');
    source.cores.splice(0, amount);
    for (let i = 0; i < amount; i++) target.cores.push(1);
    this.log.push({ type: 'move-core', player: playerIdx, source: sourceUid, target: targetUid, amount });
    this._vanishIfBelowMinLevel(playerIdx, sourceUid);
  }

  // 官方真實機制「BP/コア」：卡片印刷面上直接記載多階段的「貼滿N個核心時BP
  // 變成多少」門檻表（bpLevels），不是每貼1個核心固定+1000。只有貼到的核心數
  // 達到某一階門檻，BP才會跳到那一階印的數值；沒有 bpLevels 資料的卡（目前
  // 只有示範卡池）則維持舊有的簡化規則（每貼1核心+1000BP），維持向下相容。
  effectiveBp(instance) {
    const card = this.db.getCard(instance.cardId);
    const coreCount = instance.cores.length;
    if (Array.isArray(card.bpLevels) && card.bpLevels.length > 0) {
      let bp = card.bp || 0;
      for (const level of card.bpLevels) {
        if (level.bp !== null && coreCount >= level.cores) bp = level.bp;
      }
      return bp;
    }
    const base = card.bp || 0;
    return base + coreCount * 1000;
  }

  // ---- 召喚條件檢查（僅究極卡需要；一般精靈/據點沒有這道檢查） ----
  // 回傳 { sacrificeUids }：條件類型是 'sacrifice' 時，實際要犧牲的卡片 uid 清單。
  _checkSummonCondition(playerIdx, card, extra = {}) {
    const cond = card.summonCondition;
    if (!cond || cond.type === 'always') return { sacrificeUids: [] };
    const p = this._p(playerIdx);

    if (cond.type === 'sacrifice') {
      const uids = extra.sacrificeUids || [];
      if (uids.length < cond.value) {
        throw new Error(`召喚條件不足：需犧牲自己場上 ${cond.value} 張卡片${cond.text ? '（' + cond.text + '）' : ''}`);
      }
      for (const uid of uids) {
        if (!p.field.some((c) => c.uid === uid)) throw new Error('犧牲對象必須是自己場上的卡片');
      }
      return { sacrificeUids: uids.slice(0, cond.value) };
    }
    if (cond.type === 'ownFieldBpAtLeast') {
      const ok = p.field.some((c) => this.effectiveBp(c) >= cond.value);
      if (!ok) throw new Error(`召喚條件不足：自己場上需要有一張 BP ${cond.value} 以上的卡片${cond.text ? '（' + cond.text + '）' : ''}`);
      return { sacrificeUids: [] };
    }
    if (cond.type === 'lifeAtMost') {
      if (p.life > cond.value) throw new Error(`召喚條件不足：生命核心需在 ${cond.value} 個以下${cond.text ? '（' + cond.text + '）' : ''}`);
      return { sacrificeUids: [] };
    }
    throw new Error(`未知的召喚條件類型: ${cond.type}`);
  }

  // 官方「軽減コスト」機制：自己場上如果有跟這張卡「減輕標誌」同色的標誌，
  // 就能折抵費用，折抵到不能超額支付；規則明講「若可減輕費用，則必須進行
  // 減輕」（強制，不能選擇不減）。
  // 附註：目前抓到的官方卡片資料只記錄了減輕標誌的顏色（costAlleviationColor），
  // 沒有記錄實際張數，這裡先假設固定可折抵1點；「6色任一色」／「究極」專用／
  // 「神」專用這幾種特殊減輕標誌也還沒有對應資料可以分辨，暫不支援，之後補到
  // 資料再擴充。
  _costAlleviationAmount(playerIdx, card) {
    if (!card.costAlleviationColor) return 0;
    const p = this._p(playerIdx);
    const hasStamp = p.field.some((inst) => {
      const c = this.db.getCard(inst.cardId);
      return (c.colors || []).includes(card.costAlleviationColor);
    });
    return hasStamp ? 1 : 0;
  }

  // ---- 主要步驟：從手牌打出卡片 ----
  // extra.sacrificeUids：究極卡若召喚條件是「犧牲場上卡片」，在此傳入要犧牲的 uid 清單。
  playCard(playerIdx, handIndex, extra = {}) {
    this.pendingBurstHint = null;
    const p = this._p(playerIdx);
    const cardId = p.hand[handIndex];
    if (!cardId) throw new Error('手牌索引無效');
    const card = this.db.getCard(cardId);

    let sacrificeUids = [];
    if (card.type === 'ultimate') {
      ({ sacrificeUids } = this._checkSummonCondition(playerIdx, card, extra));
    }

    const isFieldCard = card.type === 'spirit' || card.type === 'nexus' || card.type === 'ultimate';
    // 官方規則：召喚/配置時，付完費用後還要另外從預備區放置能量，達到卡片
    // 「維持最低Lv所需的能量數量」（一般卡最低Lv1，終極靈魂卡最低Lv3）。
    // 這是召喚程序本身的一部分，跟支付費用是兩件分開的事，沒有 bpLevels
    // 資料的卡（目前僅示範卡池）這個最低需求視為0，維持向下相容。
    const minCores = isFieldCard ? this._minCoresRequired(card) : 0;
    const alleviation = this._costAlleviationAmount(playerIdx, card);
    const finalCost = Math.max(0, card.cost - alleviation);

    if (p.reserve < finalCost + minCores) {
      throw new Error(
        `儲備核心不足：需要 ${finalCost} 點費用${minCores > 0 ? `，加上召喚時要放置的最低 ${minCores} 個能量` : ''}`
      );
    }

    this._payCost(playerIdx, finalCost);
    if (alleviation > 0) this.log.push({ type: 'cost-alleviated', player: playerIdx, cardId, amount: alleviation });
    p.hand.splice(handIndex, 1);

    if (isFieldCard) {
      for (const uid of sacrificeUids) {
        const idx = p.field.findIndex((c) => c.uid === uid);
        if (idx === -1) continue;
        const [inst] = p.field.splice(idx, 1);
        p.cardTrash.push(inst.cardId);
        this.log.push({ type: 'sacrifice', player: playerIdx, cardId: inst.cardId, uid });
      }
      const instance = { uid: nextUid(), cardId, cores: [], summonedTurn: this.turnNumber, blockedThisTurn: false, attackedThisTurn: false, awakened: false, kourinStack: [cardId] };
      if (minCores > 0) {
        p.reserve -= minCores;
        for (let i = 0; i < minCores; i++) instance.cores.push(1);
      }
      p.field.push(instance);
      this.log.push({ type: card.type === 'ultimate' ? 'play-ultimate' : 'play', player: playerIdx, cardId, uid: instance.uid });
      if (card.type === 'spirit') {
        const oppIdx = this.opponentIndex(playerIdx);
        const uids = this._fireBurstEvent(oppIdx, 'opponent-spirit-summoned').map((b) => b.uid);
        if (uids.length) this.pendingBurstHint = { ownerIdx: oppIdx, uids };
        this._checkAwakenings('opponent-spirit-summoned');
      }
      return instance;
    }
    // magic：立即結算後進卡片棄卻區（實際效果由呼叫端／AI 依 card.text 自行處理，
    // 引擎本身不做通用效果解析，這是下一階段要補的「效果腳本」系統）。
    p.cardTrash.push(cardId);
    this.log.push({ type: 'play-magic', player: playerIdx, cardId });
    return null;
  }

  // ---- 煌臨條件檢查：卡片可以指定任意條件（跟究極卡的 summonCondition 同一套
  // 精神），沒有指定 condition 時退回舊資料格式（targetFamily 陣列，相容既有
  // 示範資料）。 ----
  _checkKourinCondition(card, targetInstance) {
    const targetCard = this.db.getCard(targetInstance.cardId);
    const cond = card.kourin.condition;
    if (cond) {
      if (cond.type === 'family') {
        const ok = (targetCard.family || []).some((f) => cond.value.includes(f));
        if (!ok) throw new Error(`煌臨條件不符：目標須為 ${cond.value.join('/')} 系統${cond.text ? '（' + cond.text + '）' : ''}`);
        return;
      }
      if (cond.type === 'bpAtLeast') {
        if (this.effectiveBp(targetInstance) < cond.value) {
          throw new Error(`煌臨條件不符：目標BP需達 ${cond.value} 以上${cond.text ? '（' + cond.text + '）' : ''}`);
        }
        return;
      }
      throw new Error(`未知的煌臨條件類型: ${cond.type}`);
    }
    if (card.kourin.targetFamily?.length) {
      const ok = (targetCard.family || []).some((f) => card.kourin.targetFamily.includes(f));
      if (!ok) throw new Error(`煌臨條件不符：目標須為 ${card.kourin.targetFamily.join('/')} 系統`);
    }
  }

  // ---- 煌臨：從手牌把卡片疊放到場上一張卡片上，不是「召喚」 ----
  // 官方規則校正：煌臨不是「付費」，而是「移動自己的靈魂能量」。靈魂能量在
  // 一般情況下跟普通能量可以互通使用，這裡簡化成「只要自己預備區還有至少1點
  // 能量，就能移動其中1點作為靈魂能量」；移動的落點官方規則說是「依卡片效果
  // 指定的特定場所」，沒有逐卡資料可查，這裡預設移到煌臨完成後的卡片身上，
  // 當作額外1點核心（煌臨原卡上的能量會直接繼承，不能額外增減，這點跟官方
  // 規則一致）。若煌臨完成當下，繼承後的能量數量不足以維持新卡片的最低等級，
  // 官方規則是「無法進行煌臨」，不是煌臨完成後才消滅。
  kourinPlace(playerIdx, handIndex, targetUid) {
    this.pendingBurstHint = null;
    const p = this._p(playerIdx);
    const cardId = p.hand[handIndex];
    if (!cardId) throw new Error('手牌索引無效');
    const card = this.db.getCard(cardId);
    if (!card.kourin) throw new Error('這張卡沒有煌臨能力');
    const target = p.field.find((c) => c.uid === targetUid);
    if (!target) throw new Error('找不到場上目標卡片');

    this._checkKourinCondition(card, target);

    if (p.reserve < 1) throw new Error('預備區沒有能量可以移動，無法煌臨');

    const newCores = [...target.cores, 1]; // 繼承原本的能量，加上移動過來的1點靈魂能量
    const minCores = this._minCoresRequired(card);
    if (newCores.length < minCores) {
      throw new Error(`煌臨條件不符：疊放後的能量數量（${newCores.length}）不足以維持最低等級（需要 ${minCores}）`);
    }

    p.reserve -= 1;
    p.hand.splice(handIndex, 1);

    target.cardId = cardId;
    target.cores = newCores;
    target.awakened = false;
    target.kourinStack = [...(target.kourinStack || []), cardId];
    this.log.push({ type: 'kourin', player: playerIdx, cardId, targetUid, stack: target.kourinStack, soulEnergyMoved: 1 });
    // 煌臨不是召喚，因此不觸發「對手精靈召喚」類爆發／轉醒事件。
    return target;
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

  // ---- U觸發：攻擊時把對手牌庫最上面一張送進棄卻區，費用比自己低才算命中 ----
  _resolveUTrigger(attackerIdx, attackerCard) {
    const defenderIdx = this.opponentIndex(attackerIdx);
    const defP = this._p(defenderIdx);
    if (defP.deck.length === 0) return null; // 牌庫已空，無牌可棄，視為不觸發
    const milledId = defP.deck.shift();
    defP.cardTrash.push(milledId);
    const milledCard = this.db.getCard(milledId);
    const hit = milledCard.cost < attackerCard.cost; // 同費用不算命中
    const result = { attackerIdx, defenderIdx, milledCardId: milledId, milledCost: milledCard.cost, attackerCost: attackerCard.cost, hit };
    this.log.push({ type: 'u-trigger', ...result });
    if (hit) {
      // 命中效果：卡片文字（uTrigger.effectText）僅供顯示，實際效果先用「抽1張牌」示範
      this._drawCard(attackerIdx, 1);
      this.log.push({ type: 'u-trigger-hit-effect', player: attackerIdx, effectText: attackerCard.uTrigger?.effectText || '抽1張牌（示範效果）' });
    }
    return result;
  }

  // ---- 攻擊步驟 ----
  declareAttack(playerIdx, attackerUid) {
    this.pendingBurstHint = null;
    this.pendingUTriggerResult = null;
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

    const attackerCard = this.db.getCard(attacker.cardId);
    if (attackerCard.uTrigger) {
      this.pendingUTriggerResult = this._resolveUTrigger(playerIdx, attackerCard);
    }
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

  // _destroy 只會從 _resolveCombat 呼叫（戰鬥破壞），一定是「因對手而離場」；
  // 犧牲（sacrifice）等自己造成的離場是在 playCard 裡直接處理，不會經過這裡。
  // 這剛好符合官方規則「契約卡只有因對手效果離場時才能變成魂狀態」的限定。
  _destroy(playerIdx, uid) {
    const p = this._p(playerIdx);
    const idx = p.field.findIndex((c) => c.uid === uid);
    if (idx === -1) return;
    const [inst] = p.field.splice(idx, 1);
    const card = this.db.getCard(inst.cardId);

    // 契約卡：因對手效果離場時，可以不進棄卻區，改為在場地上變成「魂狀態」
    // 保留下來（官方規則其實是「可以選擇」，但目前沒有UI介面讓玩家選擇要不要
    // 保留，這裡簡化成自動保留；身上的能量歸還預備區）。目前沒有任何效果腳本
    // 可以把魂狀態的卡復活，所以會一直留在 soulStateZone 裡，之後有效果腳本
    // 系統再補上復活機制。
    if (card.contractCard) {
      p.reserve += inst.cores.length;
      p.soulStateZone.push({ uid: inst.uid, cardId: inst.cardId });
      this.log.push({ type: 'contract-soul-state', player: playerIdx, cardId: inst.cardId, uid });
      return;
    }

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
      if (result.lifeLost > 0) this._checkAwakenings('life-reduced');
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
      soulStateZone: p.soulStateZone,
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
      pendingUTriggerResult: this.pendingUTriggerResult,
      winner: this.winner,
      players: this.players.map((p, i) =>
        snapshotPlayer(p, forPlayerIdx !== null && i !== forPlayerIdx)
      ),
    };
  }
}
