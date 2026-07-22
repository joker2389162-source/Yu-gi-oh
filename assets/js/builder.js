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

  function buildFromKeyword(keyword, cards, opts) {
    const notes = [];
    // 主題卡池：卡名含關鍵字者優先（乾淨的系列）；太少時退回較廣的相關結果
    let named = cards.filter(function (c) { return c.name.indexOf(keyword) >= 0; });
    let mode = "archetype";
    if (named.length < 4) { mode = "loose"; named = cards.slice(0, 24); }

    const mons = named.filter(function (c) { return c.kind === "monster" && !isExtraMon(c); });
    const extras = named.filter(isExtraMon);
    const spells = named.filter(function (c) { return c.kind === "spell"; });
    const traps = named.filter(function (c) { return c.kind === "trap"; });

    // 主屬性偵測（用於提示與屬性配對額外卡）
    const attrCount = {};
    mons.forEach(function (c) { if (c.attrCN) attrCount[c.attrCN] = (attrCount[c.attrCN] || 0) + 1; });
    const domAttr = Object.keys(attrCount).sort(function (a, b) { return attrCount[b] - attrCount[a]; })[0] || null;

    // 依等級決定張數：低星（搜尋／展開）多放，高星大怪少放
    function monCopies(c) { const lv = Number(c.level) || 0; if (lv <= 4) return 3; if (lv <= 6) return 2; return 1; }
    function spCopies(c) { return /场地|場地/.test(c.typeLine || "") ? 1 : 2; }
    mons.sort(function (a, b) { return (Number(a.level) || 0) - (Number(b.level) || 0); });

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

    // 4) 手坑 5) 破壞卡
    const htPool = HANDTRAPS.filter(function (h) { return budgetOk(h, opts.budget); });
    let htLeft = ht;
    for (const h of htPool) { if (htLeft <= 0) break; const c = Math.min(3, htLeft); push(st(h), c); htLeft -= c; }
    const bkPool = BREAKERS.filter(function (b) { return budgetOk(b, opts.budget); });
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

    return {
      main: main, extra: extra, side: side, notes: notes, mode: mode, domAttr: domAttr, effStyle: effStyle,
      themed: { mons: mons.length, spells: spells.length, traps: traps.length, extras: extras.length },
    };
  }

  return { build: build, buildFromKeyword: buildFromKeyword };
})();
