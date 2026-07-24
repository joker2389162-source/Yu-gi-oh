/* 我的卡池 + Master Duel 點數（CP）+ 稀有度/禁限查詢 + 缺卡花費計算
 * 稀有度與禁限資料由 assets/data/md.js 提供（window.__MD_RARITY / __MD_BAN），
 * 隨卡庫索引一起載入。點數與擁有卡片存 localStorage。
 */
const Collection = (function () {
  const OWN_KEY = "ygo_owned_v1";
  const CP_KEY = "ygo_cp_v1";
  // Master Duel 合成花費（各稀有度使用各自點數池）
  const CRAFT = { N: 10, R: 30, SR: 30, UR: 30 };

  let owned = load(OWN_KEY, {});          // { id: 1 }
  let cp = load(CP_KEY, { UR: 0, SR: 0, R: 0, N: 0 });

  function load(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v || d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  const listeners = [];
  function onChange(fn) { listeners.push(fn); }
  function emit() { listeners.forEach(function (fn) { try { fn(); } catch (e) {} }); }

  /* ---- 稀有度 / 禁限 ---- */
  function rarityOf(id) {
    const m = (typeof window !== "undefined" && window.__MD_RARITY) ? window.__MD_RARITY[id] : null;
    return m || null;   // "N"/"R"/"SR"/"UR" 或 null（MD 未收錄）
  }
  function banOf(id) {
    const b = (typeof window !== "undefined" && window.__MD_BAN) ? window.__MD_BAN[id] : null;
    return b || null;   // "F"/"1"/"2" 或 null
  }
  function maxCopies(id) {
    const b = banOf(id);
    if (b === "F") return 0; if (b === "1") return 1; if (b === "2") return 2; return 3;
  }
  function craftCost(id) { const r = rarityOf(id); return r ? (CRAFT[r] || 0) : 0; }

  /* ---- 我的卡池（擁有卡片）---- */
  function has(id) { return !!owned[id]; }
  function toggle(id) { if (owned[id]) delete owned[id]; else owned[id] = 1; save(OWN_KEY, owned); emit(); return has(id); }
  function setOwned(id, val) { if (val) owned[id] = 1; else delete owned[id]; save(OWN_KEY, owned); emit(); }
  function addMany(ids) { ids.forEach(function (id) { owned[id] = 1; }); save(OWN_KEY, owned); emit(); }
  function ownedCount() { return Object.keys(owned).length; }
  function ownedSet() { return owned; }
  function clearOwned() { owned = {}; save(OWN_KEY, owned); emit(); }

  /* ---- 點數（CP）---- */
  function getCP() { return { UR: cp.UR || 0, SR: cp.SR || 0, R: cp.R || 0, N: cp.N || 0 }; }
  function setCP(next) { cp = { UR: +next.UR || 0, SR: +next.SR || 0, R: +next.R || 0, N: +next.N || 0 }; save(CP_KEY, cp); emit(); }

  /* ---- 缺卡花費計算 ----
   * deck.main/extra/side: [{id,q}]；回傳 { missing:[{id,q,rarity}], cost:{UR,SR,R,N}, ownedInDeck, missingCount, unknown }
   */
  function analyzeDeck(deck) {
    const groups = [].concat(deck.main || [], deck.extra || [], deck.side || []);
    const cost = { UR: 0, SR: 0, R: 0, N: 0 };
    const missing = [];
    let ownedInDeck = 0, missingCount = 0, unknown = 0;
    groups.forEach(function (x) {
      const needQ = x.q;
      const haveIt = has(x.id);
      const r = rarityOf(x.id);
      if (haveIt) { ownedInDeck += needQ; return; }
      // 未擁有 → 需合成
      missingCount += needQ;
      if (!r) { unknown += needQ; }
      else { cost[r] += (CRAFT[r] || 0) * needQ; }
      missing.push({ id: x.id, q: needQ, rarity: r });
    });
    const have = getCP();
    const affordable = cost.UR <= have.UR && cost.SR <= have.SR && cost.R <= have.R && cost.N <= have.N;
    return { missing: missing, cost: cost, ownedInDeck: ownedInDeck, missingCount: missingCount, unknown: unknown, have: have, affordable: affordable };
  }

  return {
    CRAFT: CRAFT, rarityOf: rarityOf, banOf: banOf, maxCopies: maxCopies, craftCost: craftCost,
    has: has, toggle: toggle, setOwned: setOwned, addMany: addMany, ownedCount: ownedCount, ownedSet: ownedSet, clearOwned: clearOwned,
    getCP: getCP, setCP: setCP, analyzeDeck: analyzeDeck, onChange: onChange,
  };
})();
