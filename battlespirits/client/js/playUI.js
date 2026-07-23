import { Game } from '../../shared/engine/game.js';
import { aiRunMainStep, aiRunCoreStep, aiDecideBlockForOpponent, aiAutoResolveBurst } from '../../shared/engine/ai.js';
import { validateDeck } from '../../shared/engine/format.js';
import { STEP_LABELS } from '../../shared/engine/rules.js';
import { NetClient } from './netClient.js';
import { cardArtHtml, KEYWORD_LABELS } from './cardView.js';

function keywordLabel(k) {
  return KEYWORD_LABELS[k] || k;
}

const AI_ATTACK_BP_RATIO = 0.6;

function pickAiAttacker(game, aiIdx) {
  const p = game._p(aiIdx);
  const defIdx = game.opponentIndex(aiIdx);
  const defField = game._p(defIdx).field;
  const bestDefBp = defField.length ? Math.max(...defField.map((c) => game.effectiveBp(c))) : 0;
  const candidates = p.field.filter((c) => !c.attackedThisTurn && c.summonedTurn !== game.turnNumber);
  return candidates.find((c) => game.effectiveBp(c) >= bestDefBp * AI_ATTACK_BP_RATIO || defField.length === 0) || null;
}

export function initPlayTab({ db, deckStore, startersData }) {
  const root = document.getElementById('tab-play');
  let match = null; // { kind:'local', game, mode, aiIndex } | { kind:'online', net }
  // 煌臨／究極特殊召喚的「選擇目標」互動狀態：
  //   { type:'kourin', handIndex } 或 { type:'ultimate', handIndex, chosen: [uid,...] }
  let selectionMode = null;

  function renderSetup() {
    match = null;
    selectionMode = null;
    root.innerHTML = `
      <div class="play-setup">
        <h3>開始對戰</h3>
        <div class="mode-tabs">
          <button class="mode-btn active" data-mode="pve">🤖 單機對電腦</button>
          <button class="mode-btn" data-mode="hotseat">👥 本機雙人（同螢幕輪流）</button>
          <button class="mode-btn" data-mode="online">🌐 連線對戰（自架伺服器）</button>
        </div>
        <div id="mode-body"></div>
      </div>
    `;
    const body = root.querySelector('#mode-body');
    const buttons = root.querySelectorAll('.mode-btn');

    function deckSelectOptions() {
      const own = deckStore.all().map((d) => `<option value="own:${d.id}">${d.name}</option>`).join('');
      const starters = startersData.starters.map((s) => `<option value="starter:${s.id}">${s.name}（預組）</option>`).join('');
      return own + starters;
    }

    function resolveDeck(value) {
      const [kind, id] = value.split(':');
      if (kind === 'own') return deckStore.get(id);
      return startersData.starters.find((s) => s.id === id);
    }

    function renderPve() {
      body.innerHTML = `
        <p class="hint">選擇你要出戰的卡組（必須合法），電腦對手會使用示範預組之一。</p>
        <label>我的卡組 <select id="pve-my-deck">${deckSelectOptions()}</select></label>
        <label>電腦對手卡組
          <select id="pve-ai-deck">${startersData.starters.map((s) => `<option value="${s.id}">${s.name}</option>`).join('')}</select>
        </label>
        <div id="pve-deck-status" class="deck-status"></div>
        <button id="pve-start">開始對局</button>
      `;
      const myDeckSel = body.querySelector('#pve-my-deck');
      const statusEl = body.querySelector('#pve-deck-status');
      function checkStatus() {
        const deck = resolveDeck(myDeckSel.value);
        if (!deck) return;
        const r = validateDeck(deck, db);
        statusEl.className = 'deck-status ' + (r.valid ? 'ok' : 'bad');
        statusEl.textContent = r.valid ? '✅ 卡組合法，可以開始' : '❌ 卡組不合法：' + r.errors.join('；');
      }
      myDeckSel.onchange = checkStatus;
      checkStatus();
      body.querySelector('#pve-start').onclick = () => {
        const myDeck = resolveDeck(myDeckSel.value);
        const aiDeck = startersData.starters.find((s) => s.id === body.querySelector('#pve-ai-deck').value);
        const r = validateDeck(myDeck, db);
        if (!r.valid) return alert('卡組不合法，無法開始：\n' + r.errors.join('\n'));
        startLocalMatch({ mode: 'pve', deckA: myDeck, deckB: aiDeck, aiIndex: 1 });
      };
    }

    function renderHotseat() {
      body.innerHTML = `
        <p class="hint">本機雙人：兩人輪流操作同一台裝置。雙方場面資訊都會顯示（適合面對面對戰），不做手牌遮蔽。</p>
        <label>玩家1 卡組 <select id="hs-deck-a">${deckSelectOptions()}</select></label>
        <label>玩家2 卡組 <select id="hs-deck-b">${deckSelectOptions()}</select></label>
        <div id="hs-deck-status" class="deck-status"></div>
        <button id="hs-start">開始對局</button>
      `;
      const selA = body.querySelector('#hs-deck-a');
      const selB = body.querySelector('#hs-deck-b');
      const statusEl = body.querySelector('#hs-deck-status');
      function checkStatus() {
        const a = resolveDeck(selA.value);
        const b = resolveDeck(selB.value);
        const ra = a ? validateDeck(a, db) : { valid: false, errors: ['尚未選擇'] };
        const rb = b ? validateDeck(b, db) : { valid: false, errors: ['尚未選擇'] };
        statusEl.className = 'deck-status ' + (ra.valid && rb.valid ? 'ok' : 'bad');
        statusEl.textContent = (ra.valid ? '玩家1 ✅' : '玩家1 ❌ ' + ra.errors.join('；')) + ' ／ ' + (rb.valid ? '玩家2 ✅' : '玩家2 ❌ ' + rb.errors.join('；'));
      }
      selA.onchange = checkStatus;
      selB.onchange = checkStatus;
      checkStatus();
      body.querySelector('#hs-start').onclick = () => {
        const a = resolveDeck(selA.value);
        const b = resolveDeck(selB.value);
        if (!validateDeck(a, db).valid || !validateDeck(b, db).valid) return alert('有卡組不合法，無法開始。');
        startLocalMatch({ mode: 'hotseat', deckA: a, deckB: b, aiIndex: null });
      };
    }

    function renderOnline() {
      body.innerHTML = `
        <p class="hint">連線對戰需要你自己啟動 <code>battlespirits/server</code>（<code>npm install && npm start</code>），
        並填入該伺服器的 WebSocket 位址（例如同機測試用 <code>ws://localhost:8080</code>；若部署到雲端主機，改成你的網址）。</p>
        <label>伺服器位址 <input id="ws-url" type="text" value="ws://localhost:8080" /></label>
        <label>我的卡組 <select id="online-my-deck">${deckSelectOptions()}</select></label>
        <div class="online-actions">
          <button id="online-create">建立房間</button>
          <span>或</span>
          <input id="online-code" type="text" placeholder="輸入房號" maxlength="6" style="width:8em" />
          <button id="online-join">加入房間</button>
        </div>
        <div id="online-status" class="deck-status"></div>
      `;
      const statusEl = body.querySelector('#online-status');
      const myDeckSel = body.querySelector('#online-my-deck');

      body.querySelector('#online-create').onclick = async () => {
        const deck = resolveDeck(myDeckSel.value);
        const r = validateDeck(deck, db);
        if (!r.valid) return alert('卡組不合法：' + r.errors.join('；'));
        statusEl.textContent = '連線中...';
        try {
          await startOnlineMatch({ url: body.querySelector('#ws-url').value, deck, join: null, statusEl });
        } catch (e) {
          statusEl.textContent = '連線失敗：' + e.message;
        }
      };
      body.querySelector('#online-join').onclick = async () => {
        const deck = resolveDeck(myDeckSel.value);
        const r = validateDeck(deck, db);
        if (!r.valid) return alert('卡組不合法：' + r.errors.join('；'));
        const code = body.querySelector('#online-code').value.trim().toUpperCase();
        if (!code) return alert('請輸入房號');
        statusEl.textContent = '連線中...';
        try {
          await startOnlineMatch({ url: body.querySelector('#ws-url').value, deck, join: code, statusEl });
        } catch (e) {
          statusEl.textContent = '連線失敗：' + e.message;
        }
      };
    }

    buttons.forEach((btn) => {
      btn.onclick = () => {
        buttons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const m = btn.dataset.mode;
        if (m === 'pve') renderPve();
        else if (m === 'hotseat') renderHotseat();
        else renderOnline();
      };
    });
    renderPve();
  }

  // ---------------- 本機對局（PvE / Hotseat 共用）----------------
  function startLocalMatch({ mode, deckA, deckB, aiIndex }) {
    const game = new Game([deckA, deckB], db);
    game.start();
    match = { kind: 'local', game, mode, aiIndex };
    selectionMode = null;
    runAiUntilBlocked();
    renderBoard();
  }

  // 只要輪到 AI 而且沒有卡在「等人類選攔截」的狀態，就一直自動跑下去。
  function runAiUntilBlocked() {
    const lm = match;
    const g = lm.game;
    let guard = 0;
    while (guard++ < 50) {
      if (g.winner !== null) return;
      if (lm.mode !== 'pve' || g.activePlayerIndex !== lm.aiIndex) return;
      if (g.pendingAttack) return; // 等待人類玩家的攔截決定

      if (g.currentStep === 'core') {
        aiRunCoreStep(g, lm.aiIndex);
        g.nextStep();
      } else if (g.currentStep === 'main' || g.currentStep === 'main2') {
        aiRunMainStep(g, lm.aiIndex);
        g.nextStep();
      } else if (g.currentStep === 'attack') {
        const attacker = pickAiAttacker(g, lm.aiIndex);
        if (!attacker) {
          g.nextStep();
        } else {
          g.declareAttack(lm.aiIndex, attacker.uid);
          const defenderIdx = g.opponentIndex(lm.aiIndex);
          if (defenderIdx === lm.aiIndex) continue; // 不會發生（防呆）
          if (defenderIdx !== lm.aiIndex) {
            // 防守方是人類玩家：停下來，讓 UI 顯示攔截選擇畫面
            return;
          }
        }
      } else {
        g.nextStep();
      }
    }
  }

  function controllingIndex(lm) {
    const g = lm.game;
    if (g.pendingAttack) return g.opponentIndex(g.activePlayerIndex);
    return g.activePlayerIndex;
  }

  function renderBoard() {
    if (!match) return;
    if (match.kind === 'online') renderOnlineBoard();
    else renderLocalBoard();
  }

  function renderLocalBoard() {
    const lm = match;
    const g = lm.game;
    const viewer = lm.mode === 'pve' ? 0 : controllingIndex(lm);
    const state = g.getState(lm.mode === 'pve' ? 0 : null);

    const viewFlags = {
      isMyTurnMain: viewer === g.activePlayerIndex && ['main', 'main2'].includes(g.currentStep) && !g.pendingAttack,
      isMyCoreStep: viewer === g.activePlayerIndex && g.currentStep === 'core' && !g.pendingAttack,
      isMyAttackStep: viewer === g.activePlayerIndex && g.currentStep === 'attack' && !g.pendingAttack,
      isBlockDecision: !!g.pendingAttack && controllingIndex(lm) === viewer,
      canAdvance: viewer === g.activePlayerIndex && !g.pendingAttack && g.winner === null,
    };

    root.innerHTML = boardHtml(state, { viewer, mode: lm.mode, selectionMode, ...viewFlags });
    wireBoardControls({
      ...viewFlags,
      onPlay: (handIndex) => {
        try {
          g.playCard(viewer, handIndex);
        } catch (e) {
          return alert(e.message);
        }
        renderBoard();
      },
      onSetBurst: (handIndex) => {
        try {
          g.setBurst(viewer, handIndex);
        } catch (e) {
          return alert(e.message);
        }
        renderBoard();
      },
      onAttachCore: (uid) => {
        try {
          g.attachCore(viewer, uid);
        } catch (e) {
          return alert(e.message);
        }
        renderBoard();
      },
      onStartKourin: (handIndex) => {
        selectionMode = { type: 'kourin', handIndex };
        renderBoard();
      },
      onStartUltimate: (handIndex) => {
        selectionMode = { type: 'ultimate', handIndex, chosen: [] };
        renderBoard();
      },
      onSelectMyField: (uid) => {
        if (!selectionMode) return;
        if (selectionMode.type === 'kourin') {
          try {
            g.kourinPlace(viewer, selectionMode.handIndex, uid);
          } catch (e) {
            return alert(e.message);
          }
          selectionMode = null;
          renderBoard();
        } else if (selectionMode.type === 'ultimate') {
          const i = selectionMode.chosen.indexOf(uid);
          if (i === -1) selectionMode.chosen.push(uid);
          else selectionMode.chosen.splice(i, 1);
          renderBoard();
        }
      },
      onConfirmUltimate: () => {
        if (!selectionMode || selectionMode.type !== 'ultimate') return;
        try {
          g.playCard(viewer, selectionMode.handIndex, { sacrificeUids: selectionMode.chosen });
        } catch (e) {
          return alert(e.message);
        }
        selectionMode = null;
        renderBoard();
      },
      onCancelSelection: () => {
        selectionMode = null;
        renderBoard();
      },
      onDeclareAttack: (uid) => {
        try {
          g.declareAttack(viewer, uid);
        } catch (e) {
          return alert(e.message);
        }
        const defIdx = g.opponentIndex(viewer);
        if (lm.mode === 'pve' && defIdx === lm.aiIndex) {
          aiDecideBlockForOpponent(g, defIdx);
          aiAutoResolveBurst(g, defIdx);
        }
        renderBoard();
      },
      onDeclareBlock: (uid) => {
        const defIdx = controllingIndex(lm);
        try {
          g.declareBlock(defIdx, uid || null);
        } catch (e) {
          return alert(e.message);
        }
        // 人類剛剛回應完AI的攻擊，如果還是AI的回合（AI可能還有下一隻攻擊者、或該推進步驟），
        // 要繼續讓AI跑下去，不然遊戲會卡住不動。
        if (lm.mode === 'pve' && g.activePlayerIndex === lm.aiIndex) runAiUntilBlocked();
        renderBoard();
      },
      onActivateBurst: (uid) => {
        if (!g.pendingBurstHint) return;
        try {
          g.activateBurst(g.pendingBurstHint.ownerIdx, uid);
        } catch (e) {
          return alert(e.message);
        }
        renderBoard();
      },
      onSkipBurst: () => {
        g.pendingBurstHint = null;
        renderBoard();
      },
      onNextStep: () => {
        if (g.pendingAttack) return alert('攻擊尚未結算完畢');
        if (lm.mode === 'pve' && g.activePlayerIndex === lm.aiIndex) return; // AI回合不給人類推進
        selectionMode = null;
        g.nextStep();
        if (lm.mode === 'pve') runAiUntilBlocked();
        renderBoard();
      },
      onQuit: renderSetup,
    });
  }

  function renderOnlineBoard() {
    const net = match.net;
    const state = net.lastState;
    if (!state) {
      root.innerHTML = '<p class="hint">等待對局開始...</p>';
      return;
    }
    const viewer = net.playerIndex;
    const viewFlags = {
      isMyTurnMain: viewer === state.activePlayerIndex && ['main', 'main2'].includes(state.step) && !state.pendingAttack,
      isMyCoreStep: viewer === state.activePlayerIndex && state.step === 'core' && !state.pendingAttack,
      isMyAttackStep: viewer === state.activePlayerIndex && state.step === 'attack' && !state.pendingAttack,
      isBlockDecision: !!state.pendingAttack && viewer !== state.activePlayerIndex,
      canAdvance: viewer === state.activePlayerIndex && !state.pendingAttack && state.winner === null,
    };
    root.innerHTML = boardHtml(state, { viewer, mode: 'online', selectionMode, ...viewFlags }, net.roomCode);
    wireBoardControls({
      ...viewFlags,
      onPlay: (handIndex) => net.action('play', { handIndex }),
      onSetBurst: (handIndex) => net.action('set-burst', { handIndex }),
      onAttachCore: (uid) => net.action('attach-core', { targetUid: uid }),
      onDeclareAttack: (uid) => net.action('declare-attack', { attackerUid: uid }),
      onDeclareBlock: (uid) => net.action('declare-block', { blockerUid: uid || null }),
      onActivateBurst: (uid) => net.action('activate-burst', { uid }),
      onSkipBurst: () => {},
      onStartKourin: (handIndex) => {
        selectionMode = { type: 'kourin', handIndex };
        renderBoard();
      },
      onStartUltimate: (handIndex) => {
        selectionMode = { type: 'ultimate', handIndex, chosen: [] };
        renderBoard();
      },
      onSelectMyField: (uid) => {
        if (!selectionMode) return;
        if (selectionMode.type === 'kourin') {
          net.action('kourin', { handIndex: selectionMode.handIndex, targetUid: uid });
          selectionMode = null;
          renderBoard();
        } else if (selectionMode.type === 'ultimate') {
          const i = selectionMode.chosen.indexOf(uid);
          if (i === -1) selectionMode.chosen.push(uid);
          else selectionMode.chosen.splice(i, 1);
          renderBoard();
        }
      },
      onConfirmUltimate: () => {
        if (!selectionMode || selectionMode.type !== 'ultimate') return;
        net.action('play', { handIndex: selectionMode.handIndex, sacrificeUids: selectionMode.chosen });
        selectionMode = null;
        renderBoard();
      },
      onCancelSelection: () => {
        selectionMode = null;
        renderBoard();
      },
      onNextStep: () => {
        selectionMode = null;
        net.action('next-step');
      },
      onQuit: () => {
        net.ws?.close();
        renderSetup();
      },
    });
  }

  async function startOnlineMatch({ url, deck, join, statusEl }) {
    const net = new NetClient(url);
    net.roomCode = join;
    net.lastState = null;
    net.playerIndex = join ? 1 : 0;
    await net.connect();
    net.on('error', (m) => alert('伺服器錯誤：' + m.message));
    net.on('room_created', (m) => {
      net.roomCode = m.code;
      net.playerIndex = m.playerIndex;
      statusEl.textContent = `房間已建立，房號：${m.code}（等待對手加入...）`;
    });
    net.on('joined', (m) => {
      net.playerIndex = m.playerIndex;
    });
    net.on('opponent_joined', () => {
      statusEl.textContent = '對手已加入，遊戲開始！';
    });
    net.on('opponent_left', () => {
      alert('對手已離線，連線中斷。');
      renderSetup();
    });
    net.on('state', (m) => {
      net.lastState = m.state;
      match = { kind: 'online', net };
      selectionMode = null;
      renderBoard();
    });
    if (join) net.joinRoom(join, deck);
    else net.createRoom(deck);
  }

  function boardHtml(state, ctx, roomCode) {
    const me = state.players[ctx.viewer];
    const opp = state.players[ctx.viewer === 0 ? 1 : 0];
    const sel = ctx.selectionMode;

    const renderField = (p, owner) => p.field.map((c) => {
      const card = db.getCard(c.cardId);
      const selectable = owner === 'me' && sel && (sel.type === 'kourin' || sel.type === 'ultimate');
      const chosen = sel?.type === 'ultimate' && sel.chosen.includes(c.uid);
      return `<div class="field-card${selectable ? ' field-card--selectable' : ''}${chosen ? ' field-card--chosen' : ''}" data-uid="${c.uid}" data-owner="${owner}">
        ${cardArtHtml(card, { small: true })}
        <div class="fc-name">${card.name}</div>
        <div class="fc-bp">BP ${c.bp}</div>
        <div class="fc-kw">${(card.keywords || []).map(keywordLabel).join('／')}</div>
        ${c.attackedThisTurn ? '<span class="tag">已攻擊</span>' : ''}
        ${c.awakened ? '<span class="tag tag--awaken">已轉醒</span>' : ''}
        ${c.kourinStack && c.kourinStack.length > 1 ? '<span class="tag tag--kourin">已煌臨</span>' : ''}
      </div>`;
    }).join('') || '<p class="hint-small">（場上沒有卡片）</p>';

    const showBurstPanel = state.pendingBurstHint && state.pendingBurstHint.ownerIdx === ctx.viewer;

    return `
      <div class="board">
        <div class="board-topbar">
          <button id="quit-btn">← 離開對局</button>
          <div class="turn-indicator">第 ${state.turnNumber} 回合・${STEP_LABELS[state.step]}・輪到 ${state.activePlayerIndex === ctx.viewer ? '你' : '對手'}</div>
          ${roomCode ? `<div class="room-code">房號：${roomCode}</div>` : ''}
          <button id="next-step-btn" ${ctx.canAdvance ? '' : 'disabled'}>推進到下一步驟 ▶</button>
        </div>

        ${state.winner !== null ? `<div class="game-over">🏆 對局結束，玩家${state.winner + 1}（${state.winner === ctx.viewer ? '你' : '對手'}）獲勝！</div>` : ''}

        <div class="opp-area">
          <div class="player-stats">對手 ・ 生命核心 ${opp.life} ・ 儲備 ${opp.reserve} ・ 棄核 ${opp.coreTrash} ・ 手牌 ${opp.handCount} 張 ・ 牌庫 ${opp.deckCount} 張 ・ 爆發區 ${opp.burstZoneCount} 張</div>
          <div class="field">${renderField(opp, 'opp')}</div>
        </div>

        ${state.pendingAttack ? `
          <div class="combat-box">
            ⚔️ 攻擊中：${(() => {
              const atkOwner = state.players[state.activePlayerIndex];
              const atkCard = atkOwner.field.find((c) => c.uid === state.pendingAttack.attackerUid);
              return atkCard ? db.getCard(atkCard.cardId).name + `（BP ${atkCard.bp}）` : '';
            })()}
            ${ctx.isBlockDecision ? `
              <div class="block-choices">
                <p>選擇要用來攔截的卡片（需有 Blocker 能力），或選擇不攔截：</p>
                ${me.field.map((c) => `<button class="block-choice-btn" data-uid="${c.uid}">${db.getCard(c.cardId).name}（BP ${c.bp}）</button>`).join('')}
                <button class="block-choice-btn" data-uid="">不攔截，直接受到傷害</button>
              </div>
            ` : '<p class="hint-small">等待對手決定是否攔截...</p>'}
          </div>
        ` : ''}

        ${showBurstPanel ? `
          <div class="burst-box">
            ✨ 你有可發動的爆發卡！
            ${state.pendingBurstHint.uids.map((uid) => `<button class="burst-activate-btn" data-uid="${uid}">發動</button>`).join('')}
            <button id="skip-burst-btn">不發動</button>
          </div>
        ` : ''}

        ${state.pendingUTriggerResult ? `
          <div class="utrigger-box">
            🎯 U觸發：把${state.pendingUTriggerResult.defenderIdx === ctx.viewer ? '自己' : '對手'}牌庫最上面的
            「${db.getCard(state.pendingUTriggerResult.milledCardId).name}」（費${state.pendingUTriggerResult.milledCost}）送進棄卻區，
            比較究極卡費用（${state.pendingUTriggerResult.attackerCost}）——
            ${state.pendingUTriggerResult.hit ? '<strong>命中！</strong>發動效果（抽1張牌）' : '未命中（費用沒有比較低）'}
          </div>
        ` : ''}

        <div class="my-area">
          <div class="field">${renderField(me, 'me')}</div>
          <div class="player-stats">你 ・ 生命核心 ${me.life} ・ 儲備 ${me.reserve} ・ 棄核 ${me.coreTrash} ・ 牌庫 ${me.deckCount} 張 ・ 爆發區 ${me.burstZoneCount} 張</div>

          ${ctx.isMyCoreStep ? '<p class="hint-small">核心步驟：點選場上一張自己的卡片，從儲備核心貼1個上去強化 BP+1000。</p>' : ''}

          ${sel ? `
            <div class="selection-box">
              ${sel.type === 'kourin' ? `煌臨：請點選自己場上要疊放的目標卡片（${db.getCard(me.hand[sel.handIndex]).kourin.targetFamily?.length ? '限 ' + db.getCard(me.hand[sel.handIndex]).kourin.targetFamily.join('/') + ' 系' : '不限系統'}）` : ''}
              ${sel.type === 'ultimate' ? `究極召喚條件：請點選 ${db.getCard(me.hand[sel.handIndex]).summonCondition.value} 張自己場上的卡片作為犧牲（已選 ${sel.chosen.length} 張）` : ''}
              ${sel.type === 'ultimate' ? `<button id="confirm-ultimate-btn" ${sel.chosen.length >= db.getCard(me.hand[sel.handIndex]).summonCondition.value ? '' : 'disabled'}>確認召喚</button>` : ''}
              <button id="cancel-selection-btn">取消</button>
            </div>
          ` : ''}

          <div class="hand">
            <h4>手牌（${me.hand.length}）</h4>
            <div class="hand-cards">
              ${me.hand.map((cardId, i) => {
                if (cardId === null) return `<div class="hand-card hand-card--back">🂠</div>`;
                const card = db.getCard(cardId);
                const affordable = card.cost <= me.reserve;
                const needsSacrificeUI = card.type === 'ultimate' && card.summonCondition?.type === 'sacrifice';
                return `<div class="hand-card${affordable ? '' : ' hand-card--unaffordable'}" data-idx="${i}">
                  ${cardArtHtml(card, { small: true })}
                  <div class="hc-name">${card.name}${card.contractCard ? ' <span class="tag tag--contract">契約</span>' : ''}</div>
                  <div class="hc-meta">費${card.cost}${card.bp != null ? ` BP${card.bp}` : ''}</div>
                  <div class="hc-text">${card.text}</div>
                  <div class="hc-actions">
                    ${ctx.isMyTurnMain && !needsSacrificeUI ? `<button class="play-btn" data-idx="${i}" ${affordable ? '' : 'disabled'}>打出</button>` : ''}
                    ${ctx.isMyTurnMain && card.burst ? `<button class="setburst-btn" data-idx="${i}">設置爆發</button>` : ''}
                    ${ctx.isMyTurnMain && card.kourin ? `<button class="kourin-btn" data-idx="${i}">煌臨</button>` : ''}
                    ${ctx.isMyTurnMain && needsSacrificeUI ? `<button class="ultimate-btn" data-idx="${i}">召喚（需犧牲卡片）</button>` : ''}
                  </div>
                </div>`;
              }).join('') || '<p class="hint-small">（沒有手牌）</p>'}
            </div>
          </div>

          ${ctx.isMyAttackStep ? `
            <div class="attack-controls">
              <h4>宣告攻擊（選一張還沒攻擊過的場上卡片）</h4>
              ${me.field.filter((c) => !c.attackedThisTurn && c.summonedTurn !== state.turnNumber).map((c) => `<button class="attack-btn" data-uid="${c.uid}">${db.getCard(c.cardId).name} 攻擊</button>`).join('') || '<p class="hint-small">沒有可攻擊的卡片。</p>'}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  function wireBoardControls(cb) {
    root.querySelector('#quit-btn')?.addEventListener('click', () => {
      if (confirm('確定離開對局？')) cb.onQuit();
    });
    root.querySelector('#next-step-btn')?.addEventListener('click', cb.onNextStep);
    root.querySelectorAll('.play-btn').forEach((btn) => {
      btn.addEventListener('click', () => cb.onPlay(Number(btn.dataset.idx)));
    });
    root.querySelectorAll('.setburst-btn').forEach((btn) => {
      btn.addEventListener('click', () => cb.onSetBurst(Number(btn.dataset.idx)));
    });
    root.querySelectorAll('.kourin-btn').forEach((btn) => {
      btn.addEventListener('click', () => cb.onStartKourin(Number(btn.dataset.idx)));
    });
    root.querySelectorAll('.ultimate-btn').forEach((btn) => {
      btn.addEventListener('click', () => cb.onStartUltimate(Number(btn.dataset.idx)));
    });
    root.querySelector('#confirm-ultimate-btn')?.addEventListener('click', cb.onConfirmUltimate);
    root.querySelector('#cancel-selection-btn')?.addEventListener('click', cb.onCancelSelection);
    root.querySelectorAll('.field-card').forEach((el) => {
      el.addEventListener('click', () => {
        if (el.dataset.owner === 'me' && (cb.onSelectMyField && el.classList.contains('field-card--selectable'))) {
          cb.onSelectMyField(el.dataset.uid);
        } else if (cb.isMyCoreStep && el.dataset.owner === 'me') {
          cb.onAttachCore(el.dataset.uid);
        }
      });
    });
    root.querySelectorAll('.attack-btn').forEach((btn) => {
      btn.addEventListener('click', () => cb.onDeclareAttack(btn.dataset.uid));
    });
    root.querySelectorAll('.block-choice-btn').forEach((btn) => {
      btn.addEventListener('click', () => cb.onDeclareBlock(btn.dataset.uid || null));
    });
    root.querySelectorAll('.burst-activate-btn').forEach((btn) => {
      btn.addEventListener('click', () => cb.onActivateBurst(btn.dataset.uid));
    });
    root.querySelector('#skip-burst-btn')?.addEventListener('click', cb.onSkipBurst);
  }

  renderSetup();
  return { renderSetup, hasMatch: () => match !== null };
}
