/*
 * 工作卡組狀態：主卡組 / 額外 / 副卡組。存 localStorage，可跨分頁共用（搜索加卡、生成器產出）。
 * 匯出 .ydk（可匯入 EDOPro / Master Duel 模擬器）與純文字。
 */
const Deck = (function () {
  const KEY = "ygo_working_deck_v1";
  let state = load();

  function blank() { return { main: [], extra: [], side: [] }; }
  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.main) return s; } catch (e) {}
    return blank();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} emit(); }

  const listeners = [];
  function onChange(fn) { listeners.push(fn); }
  function emit() { listeners.forEach(function (fn) { try { fn(state); } catch (e) {} }); }

  function get() { return state; }
  function set(next) { state = { main: next.main || [], extra: next.extra || [], side: next.side || [] }; save(); }
  function clear() { state = blank(); save(); }

  // 依 ygocdb type 判定該進哪一區
  function sectionFor(card) {
    const t = card.typeLine || "";
    if (/融合|同调|同調|超量|连接|連接|灵摆超量|link|xyz|synchro|fusion/i.test(t) &&
        (t.indexOf("怪兽") >= 0 || t.indexOf("怪獸") >= 0)) return "extra";
    if (t.indexOf("灵摆") >= 0 || t.indexOf("靈擺") >= 0) {
      // 灵摆怪獸主流仍多放主卡組，但融合/同調/超量/連接灵摆入額外，上面已判掉
      return "main";
    }
    return "main";
  }

  function total(id) {
    let n = 0;
    ["main", "extra", "side"].forEach(function (s) {
      const e = state[s].find(function (x) { return x.id === id; });
      if (e) n += e.q;
    });
    return n;
  }

  // 加入一張卡（自動選區，遵守 3 張上限、額外/副 15 上限）
  function add(card, section) {
    const sec = section || sectionFor(card);
    if (total(card.id) >= 3) return { ok: false, msg: "已達每種卡 3 張上限" };
    if ((sec === "extra" || sec === "side") && count(sec) >= 15)
      return { ok: false, msg: (sec === "extra" ? "額外" : "副") + "卡組已達 15 張上限" };
    if (sec === "main" && count("main") >= 60) return { ok: false, msg: "主卡組已達 60 張上限" };
    const entry = state[sec].find(function (x) { return x.id === card.id; });
    if (entry) entry.q += 1;
    else state[sec].push({ id: card.id, n: card.name, q: 1 });
    save();
    return { ok: true };
  }

  function sub(id, section) {
    const arr = state[section];
    const i = arr.findIndex(function (x) { return x.id === id; });
    if (i < 0) return;
    arr[i].q -= 1;
    if (arr[i].q <= 0) arr.splice(i, 1);
    save();
  }

  function count(section) {
    return state[section].reduce(function (a, x) { return a + x.q; }, 0);
  }

  function validate() {
    const msgs = [];
    const m = count("main"), e = count("extra"), s = count("side");
    if (m < 40) msgs.push("主卡組不足 40 張（目前 " + m + "）");
    if (m > 60) msgs.push("主卡組超過 60 張（目前 " + m + "）");
    if (e > 15) msgs.push("額外卡組超過 15 張");
    if (s > 15) msgs.push("副卡組超過 15 張");
    ["main", "extra", "side"].forEach(function (sec) {
      state[sec].forEach(function (x) { if (total(x.id) > 3) msgs.push(x.n + " 超過 3 張"); });
    });
    return { ok: msgs.length === 0, msgs: msgs };
  }

  function toYdk() {
    const lines = ["#created by 遊戲王中文卡表工具", "#main"];
    state.main.forEach(function (x) { for (let i = 0; i < x.q; i++) lines.push(x.id); });
    lines.push("#extra");
    state.extra.forEach(function (x) { for (let i = 0; i < x.q; i++) lines.push(x.id); });
    lines.push("!side");
    state.side.forEach(function (x) { for (let i = 0; i < x.q; i++) lines.push(x.id); });
    return lines.join("\n");
  }

  function toText() {
    function block(title, arr) {
      if (!arr.length) return "";
      return "【" + title + "】(" + arr.reduce(function (a, x) { return a + x.q; }, 0) + ")\n" +
        arr.map(function (x) { return x.q + "  " + x.n; }).join("\n") + "\n";
    }
    return [block("主卡組", state.main), block("額外卡組", state.extra), block("副卡組", state.side)]
      .filter(Boolean).join("\n");
  }

  return { get, set, clear, add, sub, count, total, validate, toYdk, toText, onChange, sectionFor };
})();
