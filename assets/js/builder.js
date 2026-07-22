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

  return { build: build };
})();
