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
  function ownOk() { return true; }   // 模組層級預設；buildFromKeyword 內有區域版覆蓋

  function build(opts) {
    const eng = ENGINES[opts.archetype];
    const notes = [];
    const main = clone(eng.core.filter(function (c) { return c.q > 0; }));

    // 手坑
    const htPool = HANDTRAPS.filter(function (h) { return budgetOk(h, opts.budget) && ownOk(h.id); });
    let htLeft = opts.handtraps;
    for (const h of htPool) {
      if (htLeft <= 0) break;
      const c = Math.min(3, htLeft);
      pushCopies(main, h, c);
      htLeft -= c;
    }
    if (htLeft > 0) notes.push("手坑池不足所選數量（預算限制），已盡量放入。");

    // 破壞／拆場
    const bkPool = BREAKERS.filter(function (b) { return budgetOk(b, opts.budget) && ownOk(b.id); });
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
    BREAKERS.filter(function (b) { return budgetOk(b, opts.budget) && ownOk(b.id); }).forEach(function (b) {
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
  // Master Duel 禁限：每種卡上限（Forbidden 0 / Limited 1 / Semi 2 / 其餘 3）
  function maxCopies(id) {
    const b = (typeof window !== "undefined" && window.__MD_BAN) ? window.__MD_BAN[id] : null;
    if (b === "F") return 0; if (b === "1") return 1; if (b === "2") return 2; return 3;
  }
  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  function buildFromKeyword(keyword, cards, opts, rng) {
    rng = rng || Math.random;
    const notes = [];
    // 只用擁有卡：過濾主題卡池；泛用卡於各池另行過濾
    const owned = opts.owned || {};
    function ownOk(id) { return !opts.ownedOnly || !!owned[id]; }
    if (opts.ownedOnly) cards = cards.filter(function (c) { return owned[c.id]; });
    // 策略流派：命中預設卡包則以其為核心（非關鍵字系列）
    const preset = (typeof presetFor === "function") ? presetFor(keyword) : null;
    // 主題卡池：卡名含關鍵字者優先（乾淨的系列）；太少時退回較廣的相關結果
    let named, mode;
    if (preset) { named = []; mode = "strategy"; }
    else {
      named = cards.filter(function (c) { return c.name.indexOf(keyword) >= 0; });
      mode = "archetype";
      if (named.length < 4) { mode = "loose"; named = cards.slice(0, 24); }
    }

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

    // 引擎補全 / 策略卡包：注入核心卡（與主題不同名，或流派固定卡包）
    const supRole = {}, supIds = {};
    const sup = preset ? preset : ((typeof supplementFor === "function") ? supplementFor(keyword) : []);
    sup.forEach(function (c) {
      if (!ownOk(c.id)) return;
      supIds[c.id] = 1; if (c.role) supRole[c.id] = c.role;
      if (c.kind === "monster" && !isExtraMon(c)) { if (!isNormalMon(c) || c.role) mons.push(c); }
      else if (c.kind === "spell") spells.push(c);
      else if (c.kind === "trap") traps.push(c);
    });
    if (sup.length && !preset) notes.push("已補上此主題的核心引擎卡（" + sup.length + " 種，與主題不同名，keyword 搜不到）。");
    if (preset) notes.push("此為玩法導向的「策略流派」卡包，以固定核心卡＋泛用卡組成，非單一系列。");

    // 自動關聯支援：效果文本提及主題、且為主卡組低星怪／魔法的相關卡（由本地全文搜索帶入）
    let relCount = 0;
    if (!preset) {
      const seen = {};
      mons.concat(spells, traps).forEach(function (c) { seen[c.id] = 1; });
      const rel = cards.filter(function (c) {
        if (c.name.indexOf(keyword) >= 0 || seen[c.id]) return false;   // 已是系列卡
        if (isExtraMon(c)) return false;
        if (c.kind === "monster") return (Number(c.level) || 0) <= 4 && !isNormalMon(c);
        return c.kind === "spell";
      });
      rel.sort(function (a, b) { return (a.kind === "spell" ? 1 : 0) - (b.kind === "spell" ? 1 : 0) || (Number(a.level) || 0) - (Number(b.level) || 0); });
      rel.slice(0, 10).forEach(function (c) {
        const rc = { id: c.id, name: c.name, kind: c.kind, typeLine: c.typeLine, level: c.level, attrCN: c.attrCN, supQ: 1, role: "starter" };
        if (rc.kind === "monster") mons.push(rc); else spells.push(rc);
        supIds[rc.id] = 1; supRole[rc.id] = "starter";
        relCount++;
      });
      if (relCount) notes.push("已由效果文本關聯帶入 " + relCount + " 張相關支援卡（含可連動的跨系列卡）。");
    }

    // 特殊召喚怪：視為半個展開牌（自我特召可接續）
    const ssIds = {};
    mons.forEach(function (c) { if (/特殊召唤|特殊召喚/.test(c.typeLine || "")) ssIds[c.id] = 1; });

    // 主屬性偵測（用於提示與屬性配對額外卡）
    const attrCount = {};
    mons.forEach(function (c) { if (c.attrCN) attrCount[c.attrCN] = (attrCount[c.attrCN] || 0) + 1; });
    const domAttr = Object.keys(attrCount).sort(function (a, b) { return attrCount[b] - attrCount[a]; })[0] || null;

    // ---- 效果文本分析：判斷功能角色（搜尋/展開/破場），引擎優先 ----
    function eff(c) { return (c.desc || "") + " " + (c.pdesc || ""); }
    function analyze(c) {
      const d = eff(c);
      return {
        searcher: /加入手[卡札]|檢索|检索/.test(d),
        ssDeck: /从卡组[^。；\n]{0,16}特殊召唤|從卡組[^。；\n]{0,16}特殊召喚/.test(d),
        ssSelf: /这张卡[^。；\n]{0,14}特殊召唤|這張卡[^。；\n]{0,14}特殊召喚/.test(d),
        breaker: /破坏对方|破壞對方|送去墓地|除外对方|返回卡组|回到持有者手[卡札]|的效果无效|無效並破壞/.test(d),
      };
    }
    const roleMap = {};
    function monRole(c) {
      if (supRole[c.id]) return supRole[c.id];
      const a = analyze(c), lv = Number(c.level) || 0;
      if (a.searcher || a.ssDeck) return "starter";
      if (a.ssSelf) return "extender";
      if (lv <= 4) return "starter";
      if (lv <= 6) return "mid";
      return "payoff";
    }
    function spRole(c) {
      if (supRole[c.id]) return supRole[c.id];
      const a = analyze(c);
      if (a.searcher || a.ssDeck) return "starter";
      if (a.breaker) return "breaker";
      return "spell";
    }
    function copiesFor(c, role) {
      if (c.supQ != null) return c.supQ;
      const lv = Number(c.level) || 0;
      if (role === "starter") return 3;
      if (role === "extender") return lv <= 4 ? 3 : 2;
      if (role === "mid") return 2;
      if (role === "payoff") return 1;
      if (/场地|場地/.test(c.typeLine || "")) return 1;   // 場地魔法
      return 2;                                            // 一般魔法
    }
    const RANK = { starter: 0, extender: 1, mid: 2, breaker: 2, spell: 3, payoff: 4 };
    const monInfo = mons.map(function (c) { return { c: c, role: monRole(c) }; });
    monInfo.sort(function (a, b) { return (RANK[a.role] - RANK[b.role]) || (rng() - 0.5); });
    const spInfo = spells.map(function (c) { return { c: c, role: spRole(c) }; });
    spInfo.sort(function (a, b) { return (RANK[a.role] - RANK[b.role]) || (rng() - 0.5); });

    // ---- 風格判定：依可展開牌數與陷阱比例 ----
    const themedN = mons.length + spells.length + traps.length;
    const trapRatio = themedN ? traps.length / themedN : 0;
    const starterN = monInfo.filter(function (m) { return m.role === "starter" || m.role === "extender"; }).length +
                     spInfo.filter(function (s) { return s.role === "starter"; }).length;
    let effStyle = opts.style === "auto" ? null : opts.style;
    if (!effStyle) {
      if (trapRatio >= 0.22 && traps.length >= 2) effStyle = "control";
      else if (starterN >= 6) effStyle = "combo";
      else effStyle = "midrange";
    }

    // ---- 配比：引擎優先，手坑只補剩餘，並保留後手破場卡 ----
    const size = opts.size;
    let htTarget = effStyle === "combo" ? 10 : effStyle === "control" ? 6 : 9;   // 比舊版低
    if (opts.handtraps != null && opts.style !== "auto") htTarget = opts.handtraps;
    else if (opts.handtraps != null) htTarget = Math.min(opts.handtraps, htTarget + 2);
    let bkTarget = Math.max(2, (opts.breakers != null) ? opts.breakers : (effStyle === "aggro" ? 5 : 3));
    // 引擎上限＝總張數 − 破場卡 − 目標手坑：確保手坑約 htTarget、引擎聚焦不臃腫
    const engineCap = Math.max(10, size - bkTarget - htTarget);
    const wantTraps = effStyle === "control" ? 12 : effStyle === "aggro" ? 0 : effStyle === "combo" ? 2 : 5;

    const main = [];
    function push(card, q, role) {
      if (q <= 0) return;
      const cap = maxCopies(card.id);                    // MD 禁限上限
      if (cap <= 0) return;                              // Forbidden：不放
      const e = main.find(function (x) { return x.id === card.id; });
      const cur = e ? e.q : 0;
      const add = Math.min(cap - cur, q);
      if (add <= 0) return;
      if (e) e.q += add; else main.push({ id: card.id, n: card.name || card.n, q: add });
      if (role && !roleMap[card.id]) roleMap[card.id] = role;
    }
    function count() { return main.reduce(function (a, x) { return a + x.q; }, 0); }
    function st(o) { return { id: o.id, name: o.n }; }

    // 1) 主題怪：starter→extender→mid→payoff（payoff 設上限，避免大怪太多卡手）
    let trapsAdded = 0;
    let payoffN = 0; const PAYOFF_CAP = Math.max(3, Math.round(engineCap * 0.18));
    for (const it of monInfo) {
      if (count() >= engineCap) break;
      let q = copiesFor(it.c, it.role);
      if (it.role === "payoff") { q = Math.min(q, Math.max(0, PAYOFF_CAP - payoffN)); if (q <= 0) continue; payoffN += q; }
      push(it.c, q, it.role);
    }
    // 2) 主題魔法：searcher→breaker→其他
    for (const it of spInfo) { if (count() >= engineCap) break; push(it.c, copiesFor(it.c, it.role), it.role); }
    // 3) 主題陷阱（控制風格較多）＋控制風格補泛用陷阱
    for (const c of traps) { if (count() >= engineCap || trapsAdded >= wantTraps) break; push(c, 2, "interrupt"); trapsAdded += 2; }
    if (effStyle === "control") {
      for (const gt of GENERIC_TRAPS.filter(function (t) { return budgetOk(t, opts.budget) && ownOk(t.id); })) {
        if (count() >= engineCap || trapsAdded >= wantTraps) break;
        const c = Math.min(gt.copies, wantTraps - trapsAdded); push(st(gt), c, "interrupt"); trapsAdded += c;
      }
    }

    const engineCount = count();
    if (starterN === 0 && mons.length === 0)
      notes.push("此關鍵字沒有主卡組怪獸（可能全為額外卡組或魔陷），已以魔陷＋泛用卡填充，建議再搭配其他主怪。");
    if (mode === "loose")
      notes.push("「" + keyword + "」未對應到明確系列，已改用相關卡片＋泛用卡組成 Goodstuff 骨架；換用更精確的主題名可得到更聚焦的卡組。");

    // 4) 後手破封鎖：破場卡（禁忌的一滴／閃電風暴／雷擊等）
    const bkPool = shuffle(BREAKERS.filter(function (b) { return budgetOk(b, opts.budget) && ownOk(b.id); }), rng);
    let bkLeft = bkTarget;
    for (const b of bkPool) { if (bkLeft <= 0 || count() >= size) break; const c = Math.min(2, bkLeft, size - count()); push(st(b), c, "breaker"); bkLeft -= c; }

    // 5) 手坑：填到 htTarget 或剩餘空間（引擎已優先，手坑只補位）
    const htPool = shuffle(HANDTRAPS.filter(function (h) { return budgetOk(h, opts.budget) && ownOk(h.id); }), rng);
    let htLeft = Math.min(htTarget, size - count());
    for (const h of htPool) { if (htLeft <= 0) break; const c = Math.min(3, htLeft); push(st(h), c, "handtrap"); htLeft -= c; }

    // 6) 補足剩餘：順牌泛用魔法（減卡手）→ 更多主題卡 → 最後才補手坑
    let deficit = size - count();
    if (deficit > 0) {
      for (const g of GENERIC_SPELLS.filter(function (s) { return budgetOk(s, opts.budget) && ownOk(s.id); })) {
        if (deficit <= 0) break; const e = main.find(function (x) { return x.id === g.id; }); const room = 3 - (e ? e.q : 0); if (room <= 0) continue;
        const add = Math.min(room, deficit); push(st(g), add, "spell"); deficit -= add;
      }
    }
    deficit = size - count();
    if (deficit > 0) {
      const more = monInfo.map(function (x) { return x.c; }).concat(spInfo.map(function (x) { return x.c; }));
      for (const c of more) { if (deficit <= 0) break; const e = main.find(function (x) { return x.id === c.id; }); const room = 3 - (e ? e.q : 0); if (room <= 0) continue; const add = Math.min(room, deficit); push(c, add); deficit -= add; }
    }
    deficit = size - count();
    if (deficit > 0) {
      for (const h of htPool) { if (deficit <= 0) break; const e = main.find(function (x) { return x.id === h.id; }); const room = 3 - (e ? e.q : 0); if (room <= 0) continue; const add = Math.min(room, deficit); push(st(h), add, "handtrap"); deficit -= add; }
    }
    deficit = size - count();
    if (deficit > 0) notes.push("主卡組僅 " + count() + " 張（此主題可用卡＋預算限制），可再手動補入更多主題卡至 " + size + " 張。");
    else if (deficit < 0) {
      let over = -deficit;
      // 先修剪手坑／順牌魔法，保留引擎與破場卡
      for (let i = main.length - 1; i >= 0 && over > 0; i--) {
        const r = roleMap[main[i].id]; if (r !== "handtrap" && r !== "spell") continue;
        const take = Math.min(main[i].q, over); main[i].q -= take; over -= take; if (main[i].q <= 0) main.splice(i, 1);
      }
      for (let i = main.length - 1; i >= 0 && over > 0; i--) {
        const take = Math.min(main[i].q, over); main[i].q -= take; over -= take; if (main[i].q <= 0) main.splice(i, 1);
      }
    }

    // 額外卡組：主題額外怪 → 主屬性配對額外（靈使）→ 泛用額外，補到指定張數
    const extraMax = (opts.extraMax != null) ? Math.max(0, Math.min(15, opts.extraMax)) : 15;
    const extra = [];
    function esum() { return extra.reduce(function (a, x) { return a + x.q; }, 0); }
    function addExtra(o) { if (esum() >= extraMax || !ownOk(o.id) || maxCopies(o.id) <= 0) return; if (extra.some(function (x) { return x.id === o.id; })) return; extra.push({ id: o.id, n: o.n || o.name, q: 1 }); }
    extras.forEach(addExtra);
    const attrEx = (domAttr && ATTR_EXTRA[domAttr]) ? ATTR_EXTRA[domAttr] : [];
    attrEx.forEach(addExtra);
    for (const g of GENERIC_EXTRA) { if (esum() >= extraMax) break; addExtra(g); }

    // 副卡組：泛用破壞卡示意
    const side = [];
    bkPool.forEach(function (b) {
      const cap = maxCopies(b.id);
      const inMain = main.find(function (x) { return x.id === b.id; });
      const used = inMain ? inMain.q : 0;
      if (cap - used > 0 && side.reduce(function (a, x) { return a + x.q; }, 0) < 15) side.push({ id: b.id, n: b.n, q: cap - used });
    });

    // 角色標記（供對戰模擬用）：組牌過程已記錄於 roleMap，其餘用備援判定
    const htIds = {}; HANDTRAPS.forEach(function (h) { htIds[h.id] = 1; });
    const bkIds2 = {}; BREAKERS.forEach(function (b) { bkIds2[b.id] = 1; }); GENERIC_TRAPS.forEach(function (t) { bkIds2[t.id] = 1; });
    const normalIds = {}; normals.forEach(function (c) { normalIds[c.id] = 1; });
    const roles = {};
    main.forEach(function (x) {
      if (roleMap[x.id]) roles[x.id] = roleMap[x.id];
      else if (htIds[x.id]) roles[x.id] = "handtrap";
      else if (bkIds2[x.id]) roles[x.id] = "breaker";
      else if (supRole[x.id]) roles[x.id] = supRole[x.id];
      else if (normalIds[x.id]) roles[x.id] = "brick";
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
    const starters = bag.filter(function (r) { return r === "starter" || r === "extender"; }).length;
    const mids = bag.filter(function (r) { return r === "mid"; }).length;
    const handtrapsN = bag.filter(function (r) { return r === "handtrap"; }).length;
    const breakersN = bag.filter(function (r) { return r === "breaker"; }).length;
    const engineMons = starters + mids;   // 能運轉的引擎怪張數

    const GAMES = 2000, HALF = GAMES / 2;
    let openFirst = 0, openSecond = 0, brick = 0, htSum = 0, breakHand = 0;
    for (let g = 0; g < GAMES; g++) {
      const going2 = g % 2 === 1;
      const hand = sampleHand(bag, going2 ? 6 : 5);
      let s = 0, m = 0, h = 0, iv = 0, bk = 0;
      for (const r of hand) {
        if (r === "starter" || r === "extender") s++; else if (r === "mid") m++;
        else if (r === "handtrap") h++; else if (r === "breaker") bk++; else if (r === "interrupt") iv++;
      }
      const canDevelop = s >= 1 || m >= 2;             // 能鋪場/展開
      const canAct = canDevelop || (h + iv + bk) >= 2; // 或有妨害/破場可行動
      if (going2) { if (canAct) openSecond++; if (bk >= 1 || s >= 1) breakHand++; }
      else { if (canAct) openFirst++; }
      if (!canAct && h === 0 && iv === 0 && bk === 0) brick++;
      htSum += h;
    }
    const openRate = 100 * (openFirst + openSecond) / GAMES;
    const openFirstRate = 100 * openFirst / HALF;
    const openSecondRate = 100 * openSecond / HALF;
    const brickRate = 100 * brick / GAMES;
    const breakRate = 100 * breakHand / HALF;    // 後手可破場/展開率（突破封鎖）
    const avgHandtraps = htSum / GAMES;
    const engineScore = Math.round(Math.min(30,
      starters * 1.6 + mids * 0.8 + Math.min(deck.extra.length, 15) * 0.4 + handtrapsN * 0.3 + breakersN * 0.3));

    // 勝率模型（相對 meta 基準，clamp 5–95）
    let wr = 50;
    wr += (openRate - META_BASELINE.openRate) * 0.5;
    wr += (avgHandtraps - META_BASELINE.expHandtraps) * 4.0;
    wr -= (brickRate - META_BASELINE.brickRate) * 0.6;
    wr += (engineScore - 18) * 0.7;
    wr += (breakRate - 55) * 0.12;                 // 後手破場能力
    if (engineMons < 10) wr -= (10 - engineMons) * 1.2;   // 引擎怪太少＝運轉不起來
    wr = Math.max(5, Math.min(95, wr));

    return {
      winRate: wr, openRate: openRate, openFirstRate: openFirstRate, openSecondRate: openSecondRate,
      brickRate: brickRate, breakRate: breakRate, avgHandtraps: avgHandtraps,
      engineScore: engineScore, engineMons: engineMons, handtrapsN: handtrapsN, breakersN: breakersN,
      games: GAMES, opponent: META_BASELINE.name,
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
