// 連線對戰的 client 端。純轉發使用者操作到自架的 WebSocket 伺服器，
// 畫面呈現用的狀態一律以伺服器回傳的 state 為準（伺服器是權威端）。
export class NetClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.handlers = { state: [], error: [], room_created: [], joined: [], opponent_joined: [], opponent_left: [], chat: [], open: [], close: [] };
  }

  on(type, cb) {
    (this.handlers[type] || (this.handlers[type] = [])).push(cb);
  }

  _emit(type, payload) {
    for (const cb of this.handlers[type] || []) cb(payload);
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => {
        this._emit('open');
        resolve();
      };
      this.ws.onerror = (e) => reject(e);
      this.ws.onclose = () => this._emit('close');
      this.ws.onmessage = (ev) => {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        this._emit(msg.type, msg);
      };
    });
  }

  send(obj) {
    this.ws.send(JSON.stringify(obj));
  }

  createRoom(deck) {
    this.send({ type: 'create_room', deck });
  }

  joinRoom(code, deck) {
    this.send({ type: 'join_room', code, deck });
  }

  action(name, payload = {}) {
    this.send({ type: 'action', name, payload });
  }

  chat(text) {
    this.send({ type: 'chat', text });
  }
}
