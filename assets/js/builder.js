/*
 * 卡組生成器：依使用者條件（主題／風格／手坑數／破壞卡數／張數／預算）組出一份骨架。
 * 純函式，回傳 { main, extra, side, notes }，每張為 { id, n, q }。
 */
const Builder = (function () {
  function clone(list) { return list.map(function (x) { return { id: x.id, n: x.n, q: x.q }; }); }

  function budgetOk(item, budget) {
    if (budget === "high") return true;            // 不限預算
    if (budget === "low") return item.budget !== "high"; // 省錢：低/中價，排除高價 chase 卡
    // 中等：低/中價，加上 S/A 級必跑貴卡（增殖G、灰流、尼比魯、三戰等）
    return item.budget !== "high" || item.tier === "S" || item.tier === "A";
  }

  function pushCopies(main, item, copies) {
    if (copies <= 0) return;
    const e = main.find(function (x) { return x.id === item.id; });
    if (e) e.q = Math.min(3, e.q + copies);
    else main.push({ id: item.id, n: item.n, q: Math.min(3, copies) });
  }

  function sum(list) { return list.reduce(function (a, x) { return a + x.q; }, 0); }

  function build(opts) {
    const eng = ENGINES[opts.archetype];
    const notes = [];
    const main = clone(eng.core.filter(function (c) { return c.q > 0; }));

    // 手坑
    const htPool = HANDTRAPS.filter(function (h) { return budgetOk(h, opts.budget); });
    let htLeft = opts.handtraps;
    for (const h of htPool) {
      if (htLeft <= 0) break;
      const c = Math.min(3, htLeft);
      pushCopies(main, h, c);
      htLeft -= c;
    }
    if (htLeft > 0) notes.push("手坑池不足所選數量（預算限制），已盡量放入。");

    // 破壞／拆場
    const bkPool = BREAKERS.filter(function (b) { return budgetOk(b, opts.budget); });
    let bkLeft = opts.breakers;
    for (const b of bkPool) {
      if (bkLeft <= 0) break;
      const c = Math.min(3, bkLeft);
      pushCopies(main, b, c);
      bkLeft -= c;
    }

    // 補足 / 修剪到目標張數
    let deficit = opts.size - sum(main);
    if (deficit > 0) {
      // 先把已選手坑補到 3，再動用預算內其餘手坑
      const fillers = htPool.concat(bkPool);
      for (const f of fillers) {
        if (deficit <= 0) break;
        const e = main.find(function (x) { return x.id === f.id; });
        const room = 3 - (e ? e.q : 0);
        if (room <= 0) continue;
        const c = Math.min(room, deficit);
        pushCopies(main, f, c);
        deficit -= c;
      }
      if (deficit > 0) notes.push("在預算與卡池限制下未能填滿至 " + opts.size + " 張，主卡組為 " + sum(main) + " 張，可自行補入主題卡。");
    } else if (deficit < 0) {
      // 從尾端（後加入的泛用卡）修剪
      let over = -deficit;
      for (let i = main.length - 1; i >= 0 && over > 0; i--) {
        const isCore = eng.core.some(function (c) { return c.id === main[i].id; });
        if (isCore) continue;
        const take = Math.min(main[i].q, over);
        main[i].q -= take; over -= take;
        if (main[i].q <= 0) main.splice(i, 1);
      }
    }

    // 額外卡組：主題額外 + 泛用額外，補到 15
    const extra = clone(eng.extra.filter(function (x) { return true; }).map(function (x) {
      return { id: x.id, n: x.n, q: x.q > 0 ? x.q : 1 };
    }));
    for (const g of GENERIC_EXTRA) {
      if (sum(extra) >= 15) break;
      if (extra.some(function (x) { return x.id === g.id; })) continue;
      extra.push({ id: g.id, n: g.n, q: 1 });
    }

    // 副卡組：放入預算內、主組未用滿的泛用破壞卡作示意
    const side = [];
    BREAKERS.filter(function (b) { return budgetOk(b, opts.budget); }).forEach(function (b) {
      if (sum(side) >= 15) return;
      const inMain = main.find(function (x) { return x.id === b.id; });
      const used = inMain ? inMain.q : 0;
      if (used < 3) side.push({ id: b.id, n: b.n, q: Math.min(3 - used, 3) });
    });

    return { main: main, extra: extra, side: side, notes: notes, style: eng.style };
  }

  /* ---------- 通用關鍵字生成器 ----------
   * keyword：使用者輸入的主題／卡名關鍵字
   * cards  ：YGO.search(keyword) 撈回的卡片陣列（已正規化）
   * opts   ：{ style, budget, size, handtraps, breakers }
   * 不侷限於預設主題：任何能查到相關卡的關鍵字都能組出可對戰卡組。
   */
  function isExtraMon(c) {
    return c.kind === "monster" && /融合|同调|同調|超量|连接|連接|XYZ|LINK/i.test(c.typeLine || "");
  }
  function isNormalMon(c) { return c.kind === "monster" && /通常/.test(c.typeLine || ""); }
  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  function buildFromKeyword(keyword, cards, opts, rng) {
    rng = rng || Math.random;
    const notes = [];
    // 主題卡池：卡名含關鍵字者優先（乾淨的系列）；太少時退回較廣的相關結果
    let named = cards.filter(function (c) { return c.name.indexOf(keyword) >= 0; });
    let mode = "archetype";
    if (named.length < 4) { mode = "loose"; named = cards.slice(0, 24); }

    let mons = named.filter(function (c) { return c.kind === "monster" && !isExtraMon(c); });
    const extras = named.filter(isExtraMon);
    const spells = named.filter(function (c) { return c.kind === "spell"; });
    const traps = named.filter(function (c) { return c.kind === "trap"; });

    // 濾掉無效果（通常）怪獸——除非有效果的主怪太少（保留可用性）
    const normals = mons.filter(isNormalMon);
    const effMons = mons.filter(function (c) { return !isNormalMon(c); });
    if (effMons.length >= 4) {
      if (normals.length > 0) notes.push("已略過 " + normals.length + " 張無效果（通常）怪獸，只保留有效果的核心卡。");
      mons = effMons;
    }

    // 主屬性偵測（用於提示與屬性配對額外卡）
    const attrCount = {};
    mons.forEach(function (c) { if (c.attrCN) attrCount[c.attrCN] = (attrCount[c.attrCN] || 0) + 1; });
    const domAttr = Object.keys(attrCount).sort(function (a, b) { return attrCount[b] - attrCount[a]; })[0] || null;

    // 依等級決定張數（含少量隨機變化，讓每次生成不同、更靈活）
    function monCopies(c) {
      const lv = Number(c.level) || 0;
      let base = lv <= 4 ? 3 : lv <= 6 ? 2 : 1;
      if (base === 3 && rng() < 0.25) base = 2;
      else if (base === 2 && rng() < 0.25) base = (lv <= 4 ? 3 : 1);
      return base;
    }
    function spCopies(c) { return /场地|場地/.test(c.typeLine || "") ? 1 : (rng() < 0.3 ? 3 : 2); }
    // 依等級排序，同級之間隨機打散（增加變化）
    mons.sort(function (a, b) { const d = (Number(a.level) || 0) - (Number(b.level) || 0); return d !== 0 ? d : (rng() - 0.5); });

    // 依卡組性質自動判定風格（auto）：陷阱多→控制、低星怪多→連招、其餘→中速
    const themedN = mons.length + spells.length + traps.length;
    const trapRatio = themedN ? traps.length / themedN : 0;
    const avgLevel = mons.length ? mons.reduce(function (a, c) { return a + (Number(c.level) || 0); }, 0) / mons.length : 0;
    let effStyle = opts.style === "auto" ? null : opts.style;
    if (!effStyle) {
      if (trapRatio >= 0.22 && traps.length >= 2) effStyle = "control";
      else if (mons.length >= 8 && avgLevel <= 4.2) effStyle = "combo";
      else effStyle = "midrange";
    }
    // 風格決定主題陷阱要放多少（受限於實際可用的主題陷阱）
    const wantTraps = effStyle === "control" ? 12 : effStyle === "aggro" ? 0 : effStyle === "combo" ? 3 : 6;

    const ht = opts.handtraps, bk = opts.breakers;
    const engineTarget = Math.max(12, opts.size - (ht + bk));

    const main = [];
    function push(card, q) {
      if (q <= 0) return;
      const e = main.find(function (x) { return x.id === card.id; });
      const cur = e ? e.q : 0;
      const add = Math.min(3 - cur, q);
      if (add <= 0) return;
      if (e) e.q += add; else main.push({ id: card.id, n: card.name || card.n, q: add });
    }
    function count() { return main.reduce(function (a, x) { return a + x.q; }, 0); }
    function st(o) { return { id: o.id, name: o.n }; }

    // 引擎填充（依風格決定順序：控制先塞陷阱、其餘先塞怪獸）
    let trapsAdded = 0;
    function addMonsters() { for (const c of mons) { if (count() >= engineTarget) break; push(c, monCopies(c)); } }
    function addSpells() { for (const c of spells) { if (count() >= engineTarget) break; push(c, spCopies(c)); } }
    function addThemedTraps() { for (const c of traps) { if (count() >= engineTarget || trapsAdded >= wantTraps) break; push(c, 2); trapsAdded += 2; } }
    function addGenericTraps() {
      if (effStyle !== "control") return;
      const gtPool = GENERIC_TRAPS.filter(function (t) { return budgetOk(t, opts.budget); });
      for (const gt of gtPool) {
        if (count() >= engineTarget || trapsAdded >= wantTraps) break;
        const c = Math.min(gt.copies, wantTraps - trapsAdded);
        push(st(gt), c); trapsAdded += c;
      }
    }
    if (effStyle === "control") { addThemedTraps(); addGenericTraps(); addMonsters(); addSpells(); }
    else { addMonsters(); addSpells(); addThemedTraps(); }

    if (mons.length === 0)
      notes.push("此關鍵字沒有主卡組怪獸（可能全為額外卡組或魔陷），已以主題魔陷＋泛用卡填充，建議再搭配其他主怪。");
    if (mode === "loose")
      notes.push("「" + keyword + "」未對應到明確系列，已改用相關卡片＋泛用卡組成 Goodstuff 骨架；換用更精確的主題名可得到更聚焦的卡組。");

    // 4) 手坑 5) 破壞卡（打散順序，讓每次選到的組合不同）
    const htPool = shuffle(HANDTRAPS.filter(function (h) { return budgetOk(h, opts.budget); }), rng);
    let htLeft = ht;
    for (const h of htPool) { if (htLeft <= 0) break; const c = Math.min(3, htLeft); push(st(h), c); htLeft -= c; }
    const bkPool = shuffle(BREAKERS.filter(function (b) { return budgetOk(b, opts.budget); }), rng);
    let bkLeft = bk;
    for (const b of bkPool) { if (bkLeft <= 0) break; const c = Math.min(3, bkLeft); push(st(b), c); bkLeft -= c; }

    // 6) 補足到目標張數
    let deficit = opts.size - count();
    if (deficit > 0) {
      const fillers = mons.concat(spells);
      for (const c of fillers) {
        if (deficit <= 0) break;
        const e = main.find(function (x) { return x.id === c.id; });
        const room = 3 - (e ? e.q : 0);
        if (room <= 0) continue;
        const add = Math.min(room, deficit); push(c, add); deficit -= add;
      }
    }
    deficit = opts.size - count();
    if (deficit > 0) {
      for (const h of htPool) {
        if (deficit <= 0) break;
        const e = main.find(function (x) { return x.id === h.id; });
        const room = 3 - (e ? e.q : 0);
        if (room <= 0) continue;
        const add = Math.min(room, deficit); push(st(h), add); deficit -= add;
      }
    }
    deficit = opts.size - count();
    if (deficit > 0) notes.push("主卡組僅 " + count() + " 張（此主題可用卡＋預算限制），可再手動補入更多主題卡至 " + opts.size + " 張。");
    else if (deficit < 0) {
      let over = -deficit;
      for (let i = main.length - 1; i >= 0 && over > 0; i--) {
        const take = Math.min(main[i].q, over); main[i].q -= take; over -= take;
        if (main[i].q <= 0) main.splice(i, 1);
      }
    }

    // 額外卡組：主題額外怪 → 主屬性配對額外（靈使）→ 泛用額外，補到 15
    const extra = [];
    function esum() { return extra.reduce(function (a, x) { return a + x.q; }, 0); }
    function addExtra(o) { if (esum() >= 15) return; if (extra.some(function (x) { return x.id === o.id; })) return; extra.push({ id: o.id, n: o.n || o.name, q: 1 }); }
    extras.forEach(addExtra);
    const attrEx = (domAttr && ATTR_EXTRA[domAttr]) ? ATTR_EXTRA[domAttr] : [];
    attrEx.forEach(addExtra);
    for (const g of GENERIC_EXTRA) { if (esum() >= 15) break; addExtra(g); }

    // 副卡組：泛用破壞卡示意
    const side = [];
    bkPool.forEach(function (b) {
      const inMain = main.find(function (x) { return x.id === b.id; });
      const used = inMain ? inMain.q : 0;
      if (used < 3 && side.reduce(function (a, x) { return a + x.q; }, 0) < 15) side.push({ id: b.id, n: b.n, q: 3 - used });
    });

    // 角色標記（供對戰模擬用）：starter 展開/搜尋、mid 中階、payoff 大怪、handtrap 手坑、
    // breaker 破壞/妨害陷阱、interrupt 主題陷阱、brick 無效果通常怪
    const htIds = {}; HANDTRAPS.forEach(function (h) { htIds[h.id] = 1; });
    const bkIds = {}; BREAKERS.forEach(function (b) { bkIds[b.id] = 1; }); GENERIC_TRAPS.forEach(function (t) { bkIds[t.id] = 1; });
    const monLv = {}; mons.forEach(function (c) { monLv[c.id] = Number(c.level) || 0; });
    const spellIds = {}; spells.forEach(function (c) { spellIds[c.id] = 1; });
    const trapIds = {}; traps.forEach(function (c) { trapIds[c.id] = 1; });
    const normalIds = {}; normals.forEach(function (c) { normalIds[c.id] = 1; });
    const roles = {};
    main.forEach(function (x) {
      if (htIds[x.id]) roles[x.id] = "handtrap";
      else if (bkIds[x.id]) roles[x.id] = "breaker";
      else if (normalIds[x.id]) roles[x.id] = "brick";
      else if (monLv[x.id] !== undefined) roles[x.id] = monLv[x.id] <= 4 ? "starter" : (monLv[x.id] <= 6 ? "mid" : "payoff");
      else if (spellIds[x.id]) roles[x.id] = "starter";
      else if (trapIds[x.id]) roles[x.id] = "interrupt";
      else roles[x.id] = "neutral";
    });

    return {
      main: main, extra: extra, side: side, notes: notes, mode: mode, domAttr: domAttr, effStyle: effStyle, roles: roles,
      themed: { mons: mons.length, spells: spells.length, traps: traps.length, extras: extras.length },
    };
  }

  /* ---------- 對戰模擬與勝率估計 ----------
   * 以「起手牌蒙地卡羅模擬 + 引擎/妨害評分」估計對主流卡組的相對勝率。
   * 這不是逐卡結算的完整對局引擎（遊戲王上萬卡效果無法在此完整實作），
   * 而是量化「能否穩定展開、卡手率、手坑妨害、引擎強度」等真實可算指標後估計勝率。
   */
  const META_BASELINE = { name: "主流連招卡組", openRate: 88, expHandtraps: 1.6, brickRate: 8 };

  function sampleHand(bag, handSize) {
    // 從 bag（40 張角色）不放回抽 handSize 張
    const idx = [];
    const used = {};
    const N = bag.length;
    let k = 0;
    while (k < handSize && k < N) {
      const j = Math.floor(Math.random() * N);
      if (used[j]) continue;
      used[j] = 1; idx.push(bag[j]); k++;
    }
    return idx;
  }

  function evaluateDeck(deck) {
    const roles = deck.roles || {};
    const bag = [];
    deck.main.forEach(function (x) { for (let i = 0; i < x.q; i++) bag.push(roles[x.id] || "neutral"); });
    const N = bag.length || 1;
    const starters = bag.filter(function (r) { return r === "starter"; }).length;
    const mids = bag.filter(function (r) { return r === "mid"; }).length;
    const handtrapsN = bag.filter(function (r) { return r === "handtrap"; }).length;
    const breakersN = bag.filter(function (r) { return r === "breaker" || r === "interrupt"; }).length;

    const GAMES = 2000;
    let openable = 0, brick = 0, htSum = 0;
    for (let g = 0; g < GAMES; g++) {
      const handSize = (g % 2 === 0) ? 5 : 6;   // 先手 5 / 後手 6 各半
      const hand = sampleHand(bag, handSize);
      let s = 0, m = 0, h = 0;
      for (const r of hand) { if (r === "starter") s++; else if (r === "mid") m++; else if (r === "handtrap") h++; }
      const openOK = s >= 1 || m >= 2;          // 有 1 張展開牌，或 2 張中階可搭橋
      if (openOK) openable++;
      if (!openOK && h === 0) brick++;           // 既無法展開又無妨害 = 卡手
      htSum += h;
    }
    const openRate = 100 * openable / GAMES;
    const brickRate = 100 * brick / GAMES;
    const avgHandtraps = htSum / GAMES;
    const engineScore = Math.round(Math.min(30,
      starters * 1.6 + mids * 0.8 + Math.min(deck.extra.length, 15) * 0.4 + handtrapsN * 0.4 + breakersN * 0.3));

    // 勝率模型（相對 meta 基準，clamp 5–95）
    let wr = 50;
    wr += (openRate - META_BASELINE.openRate) * 0.55;
    wr += (avgHandtraps - META_BASELINE.expHandtraps) * 5.0;
    wr -= (brickRate - META_BASELINE.brickRate) * 0.6;
    wr += (engineScore - 18) * 0.7;
    wr = Math.max(5, Math.min(95, wr));

    return {
      winRate: wr, openRate: openRate, brickRate: brickRate, avgHandtraps: avgHandtraps,
      engineScore: engineScore, games: GAMES, opponent: META_BASELINE.name,
    };
  }

  /* 生成多版、模擬對戰、回傳勝率最高者；達門檻即提早結束 */
  function buildBest(keyword, cards, opts, threshold) {
    threshold = threshold || 60;
    const MAX = 24;
    let best = null, tries = 0;
    for (let i = 0; i < MAX; i++) {
      tries++;
      const deck = buildFromKeyword(keyword, cards, opts, Math.random);
      const ev = evaluateDeck(deck);
      if (!best || ev.winRate > best.eval.winRate) best = { deck: deck, eval: ev };
      if (ev.winRate >= threshold) { return { deck: deck, eval: ev, attempts: tries, threshold: threshold }; }
    }
    return { deck: best.deck, eval: best.eval, attempts: tries, threshold: threshold };
  }

  return { build: build, buildFromKeyword: buildFromKeyword, evaluateDeck: evaluateDeck, buildBest: buildBest };
})();
