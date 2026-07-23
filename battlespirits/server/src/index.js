// 自架用 WebSocket 連線對戰伺服器。
// 用法： node src/index.js [port]  （預設 port 8080，可用環境變數 PORT 覆蓋）
//
// 通訊協定（JSON, 一行一則訊息）：
//   client -> server:
//     { type:'create_room', deck }                       建立房間，回傳房號
//     { type:'join_room', code, deck }                    加入房間，兩人到齊後自動開局
//     { type:'action', name, payload }                    遊戲內操作，見 ACTION_HANDLERS
//     { type:'chat', text }                                 簡易聊天（廣播給房內雙方）
//   server -> client:
//     { type:'room_created', code, playerIndex }
//     { type:'joined', playerIndex }
//     { type:'opponent_joined' }
//     { type:'state', state }                              個人化的對局快照（會隱藏對手手牌）
//     { type:'error', message }
//     { type:'opponent_left' }
//     { type:'chat', from, text }
//
// 本伺服器是「權威端」：所有規則判定都在這裡用 shared/engine 執行，
// client 只是把使用者操作送過來、然後畫出伺服器回傳的狀態。

import { WebSocketServer } from 'ws';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

import { createCardDatabase } from '../../shared/engine/cardDatabase.js';
import { validateDeck } from '../../shared/engine/format.js';
import { Game } from '../../shared/engine/game.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '../../shared/data');
const cardsData = JSON.parse(readFileSync(join(dataDir, 'cards.json'), 'utf-8'));
const setsData = JSON.parse(readFileSync(join(dataDir, 'sets.json'), 'utf-8'));
const banlistData = JSON.parse(readFileSync(join(dataDir, 'banlist.json'), 'utf-8'));
const db = createCardDatabase({ cardsData, setsData, banlistData });

const PORT = Number(process.env.PORT) || Number(process.argv[2]) || 8080;

/** @type {Map<string, Room>} */
const rooms = new Map();

function makeCode() {
  let code;
  do {
    code = randomBytes(3).toString('hex').toUpperCase().slice(0, 6);
  } while (rooms.has(code));
  return code;
}

class Room {
  constructor(code) {
    this.code = code;
    this.sockets = [null, null];
    this.decks = [null, null];
    this.game = null;
  }

  broadcastState() {
    if (!this.game) return;
    for (let i = 0; i < 2; i++) {
      const ws = this.sockets[i];
      if (ws && ws.readyState === ws.OPEN) {
        send(ws, { type: 'state', state: this.game.getState(i) });
      }
    }
  }
}

function send(ws, msg) {
  try {
    ws.send(JSON.stringify(msg));
  } catch {
    /* socket 可能已關閉，忽略 */
  }
}

function assertCanAct(game, idx, name) {
  const active = game.activePlayerIndex;
  if (['play', 'set-burst', 'attach-core'].includes(name)) {
    if (game.pendingAttack) throw new Error('攻擊結算中，請先處理完攻擊');
    if (idx !== active) throw new Error('現在不是你的回合');
    if (name === 'attach-core' && game.currentStep !== 'core') throw new Error('現在不是核心步驟');
    if ((name === 'play' || name === 'set-burst') && !['main', 'main2'].includes(game.currentStep)) {
      throw new Error('現在不是主要步驟');
    }
  }
  if (name === 'declare-block') {
    if (!game.pendingAttack) throw new Error('目前沒有待處理的攻擊');
    if (idx === active) throw new Error('攻擊方不能宣告攔截');
  }
  if (name === 'declare-attack') {
    if (idx !== active) throw new Error('現在不是你的回合');
  }
  if (name === 'next-step') {
    if (idx !== active) throw new Error('只有現在回合的玩家可以推進步驟');
    if (game.pendingAttack) throw new Error('攻擊結算中，請先處理完攻擊');
  }
  if (name === 'activate-burst') {
    // 任一方在自己的爆發卡可發動時都能發動，這裡不做額外限制。
  }
}

const ACTION_HANDLERS = {
  play: (game, idx, payload) => game.playCard(idx, payload.handIndex),
  'set-burst': (game, idx, payload) => game.setBurst(idx, payload.handIndex),
  'attach-core': (game, idx, payload) => game.attachCore(idx, payload.targetUid),
  'declare-attack': (game, idx, payload) => game.declareAttack(idx, payload.attackerUid),
  'declare-block': (game, idx, payload) => game.declareBlock(idx, payload.blockerUid || null),
  'activate-burst': (game, idx, payload) => game.activateBurst(idx, payload.uid),
  'next-step': (game) => game.nextStep(),
};

const wss = new WebSocketServer({ port: PORT });
console.log(`Battle Spirits 連線對戰伺服器已啟動，監聽 port ${PORT}`);

wss.on('connection', (ws) => {
  ws.roomCode = null;
  ws.playerIndex = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return send(ws, { type: 'error', message: '訊息格式錯誤' });
    }

    try {
      if (msg.type === 'create_room') {
        const deck = msg.deck;
        const result = validateDeck(deck, db);
        if (!result.valid) throw new Error('卡組不合法：' + result.errors.join('；'));
        const code = makeCode();
        const room = new Room(code);
        room.sockets[0] = ws;
        room.decks[0] = deck;
        rooms.set(code, room);
        ws.roomCode = code;
        ws.playerIndex = 0;
        send(ws, { type: 'room_created', code, playerIndex: 0 });
        return;
      }

      if (msg.type === 'join_room') {
        const room = rooms.get(msg.code);
        if (!room) throw new Error('找不到房間，請確認房號');
        if (room.sockets[1]) throw new Error('房間已滿');
        const result = validateDeck(msg.deck, db);
        if (!result.valid) throw new Error('卡組不合法：' + result.errors.join('；'));
        room.sockets[1] = ws;
        room.decks[1] = msg.deck;
        ws.roomCode = room.code;
        ws.playerIndex = 1;
        send(ws, { type: 'joined', playerIndex: 1 });
        send(room.sockets[0], { type: 'opponent_joined' });

        room.game = new Game(room.decks, db);
        room.game.start();
        room.broadcastState();
        return;
      }

      if (msg.type === 'chat') {
        const room = rooms.get(ws.roomCode);
        if (!room) return;
        for (const s of room.sockets) {
          if (s && s !== ws) send(s, { type: 'chat', from: ws.playerIndex, text: String(msg.text).slice(0, 500) });
        }
        return;
      }

      if (msg.type === 'action') {
        const room = rooms.get(ws.roomCode);
        if (!room || !room.game) throw new Error('尚未開局');
        const handler = ACTION_HANDLERS[msg.name];
        if (!handler) throw new Error('未知操作: ' + msg.name);
        assertCanAct(room.game, ws.playerIndex, msg.name);
        handler(room.game, ws.playerIndex, msg.payload || {});
        room.broadcastState();
        return;
      }
    } catch (err) {
      send(ws, { type: 'error', message: err.message || String(err) });
    }
  });

  ws.on('close', () => {
    const room = rooms.get(ws.roomCode);
    if (!room) return;
    const otherIdx = ws.playerIndex === 0 ? 1 : 0;
    const other = room.sockets[otherIdx];
    if (other) send(other, { type: 'opponent_left' });
    rooms.delete(room.code);
  });
});
