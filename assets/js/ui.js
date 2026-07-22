/* UI 層：分頁、搜索、卡片彈窗、流行構築、生成器輸出、我的卡組抽屜 */
const UI = (function () {
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function elem(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  const PLACEHOLDER = "data:image/svg+xml;utf8," + encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='120' height='174'><rect width='100%' height='100%' fill='#1c2333'/><text x='50%' y='50%' fill='#5a6a86' font-size='13' text-anchor='middle' dominant-baseline='middle'>無卡圖</text></svg>");

  function imgEl(id, name) {
    const img = elem("img", "card-img");
    img.loading = "lazy";
    img.alt = name || "";
    img.dataset.stage = "0";
    img.src = YGO.imgUrl(id, true);
    img.onerror = function () {
      if (img.dataset.stage === "0") { img.dataset.stage = "1"; img.src = YGO.imgUrl(id, false); }
      else { img.onerror = null; img.src = PLACEHOLDER; }
    };
    return img;
  }

  /* ---------- 卡片磚 ---------- */
  // item: 可為 API 卡片物件（有 name/typeLine）或資料卡 { id, n, q }
  function tile(item, opts) {
    opts = opts || {};
    const id = item.id;
    const name = item.name || item.n || String(id);
    const t = elem("div", "tile");
    if (opts.q) { const b = elem("span", "qty", "×" + opts.q); t.appendChild(b); }
    else if (item.q) { const b = elem("span", "qty", "×" + item.q); t.appendChild(b); }
    t.appendChild(imgEl(id, name));
    const cap = elem("div", "tile-cap");
    cap.appendChild(elem("span", "tile-name", esc(name)));
    if (item.typeLine) cap.appendChild(elem("span", "tile-type", esc(item.typeLine)));
    t.appendChild(cap);
    if (opts.add !== false) {
      const add = elem("button", "tile-add", "＋");
      add.title = "加入我的卡組";
      add.onclick = function (ev) { ev.stopPropagation(); addToDeck(id, name); };
      t.appendChild(add);
    }
    t.onclick = function () { openCardModal(id); };
    return t;
  }

  async function addToDeck(id, name) {
    let card = YGO._cache[id];
    if (!card) { try { card = await YGO.getById(id); } catch (e) {} }
    if (!card) card = { id: id, name: name, typeLine: "" };
    const r = Deck.add(card);
    toast(r.ok ? "已加入：" + card.name : r.msg);
  }

  /* ---------- 卡片詳情彈窗 ---------- */
  async function openCardModal(id) {
    const modal = $("#card-modal");
    const panel = $("#modal-panel");
    panel.innerHTML = "<p class='loading'>載入中…</p>";
    modal.setAttribute("aria-hidden", "false");
    let card;
    try { card = await YGO.getById(id); } catch (e) {}
    if (!card) { panel.innerHTML = "<p class='loading'>找不到此卡資料。</p>"; return; }
    panel.innerHTML = "";
    const top = elem("div", "modal-top");
    const big = imgEl(card.id, card.name); big.className = "modal-img";
    top.appendChild(big);
    const info = elem("div", "modal-info");
    info.appendChild(elem("h3", null, esc(card.name)));
    const meta = [];
    if (card.jp) meta.push(esc(card.jp));
    if (card.en) meta.push(esc(card.en));
    info.appendChild(elem("p", "modal-alt", meta.join(" ／ ")));
    info.appendChild(elem("p", "modal-typeline", esc(card.typeLine)));
    const stat = [];
    if (card.atk != null && card.kind === "monster") stat.push("攻 " + card.atk);
    if (card.def != null && card.kind === "monster") stat.push("守 " + card.def);
    if (stat.length) info.appendChild(elem("p", "modal-stat", stat.join("　")));
    const btns = elem("div", "modal-btns");
    const bMain = elem("button", "primary", "＋ 加入卡組");
    bMain.onclick = function () { const r = Deck.add(card); toast(r.ok ? "已加入" : r.msg); };
    btns.appendChild(bMain);
    info.appendChild(btns);
    top.appendChild(info);
    panel.appendChild(top);
    if (card.pdesc) {
      panel.appendChild(elem("div", "modal-pdesc", "<strong>靈擺效果</strong><br>" + esc(card.pdesc).replace(/\n/g, "<br>")));
    }
    panel.appendChild(elem("div", "modal-desc", esc(card.desc).replace(/\n/g, "<br>")));
  }

  function closeModal() { $("#card-modal").setAttribute("aria-hidden", "true"); }

  /* ---------- 搜索 ---------- */
  let lastResults = [];
  let kindFilter = "all";

  async function runSearch(term) {
    term = (term || "").trim();
    if (!term) return;
    const status = $("#search-status");
    const grid = $("#search-results");
    status.textContent = "搜索「" + term + "」中…";
    grid.innerHTML = "";
    let res = [];
    try { res = await YGO.search(term); }
    catch (e) { status.textContent = "搜索失敗：" + e.message + "（請檢查網路連線）"; return; }
    lastResults = res;
    renderSearch();
  }

  function renderSearch() {
    const grid = $("#search-results");
    const status = $("#search-status");
    grid.innerHTML = "";
    const list = lastResults.filter(function (c) { return kindFilter === "all" || c.kind === kindFilter; });
    status.textContent = "共 " + lastResults.length + " 筆" +
      (kindFilter === "all" ? "" : "（顯示 " + list.length + " 筆" + ({ monster: "怪獸", spell: "魔法", trap: "陷阱" }[kindFilter]) + "）");
    if (!list.length) { grid.innerHTML = "<p class='status'>沒有符合的卡片。</p>"; return; }
    list.forEach(function (c) { grid.appendChild(tile(c)); });
  }

  /* ---------- 流行構築 ---------- */
  function renderMetaList() {
    const wrap = $("#meta-list");
    wrap.innerHTML = "";
    META_DECKS.forEach(function (d) {
      const card = elem("div", "meta-card card-panel");
      const head = elem("div", "meta-head");
      head.innerHTML =
        "<div><span class='tier tier-" + d.tier + "'>" + d.tier + "</span>" +
        "<h3>" + esc(d.name) + "</h3></div>" +
        "<span class='style-label'>" + esc(d.styleLabel) + "</span>";
      card.appendChild(head);
      card.appendChild(elem("p", "meta-blurb", esc(d.blurb)));

      // 關鍵卡預覽
      const key = elem("div", "key-row");
      d.core.slice(0, 5).forEach(function (c) { key.appendChild(tile(c, { add: false })); });
      card.appendChild(key);

      const acts = elem("div", "meta-acts");
      const bView = elem("button", null, "📖 展開範例構築");
      const bSeries = elem("button", null, "🗃️ 載入系列全卡");
      const bImport = elem("button", "primary", "⬇️ 匯入到我的卡組");
      acts.appendChild(bView); acts.appendChild(bSeries); acts.appendChild(bImport);
      card.appendChild(acts);

      const detail = elem("div", "meta-detail");
      card.appendChild(detail);
      const skeletonBox = elem("div", "skeleton-holder");
      skeletonBox.style.display = "none";
      const seriesBox = elem("div", "series-holder");
      seriesBox.style.display = "none";
      detail.appendChild(skeletonBox);
      detail.appendChild(seriesBox);

      const mainList = combineMeta(d);
      bView.onclick = function () {
        if (skeletonBox.style.display === "none") {
          if (!skeletonBox.dataset.built) { buildMetaDetail(skeletonBox, d, mainList); skeletonBox.dataset.built = "1"; }
          skeletonBox.style.display = "block";
          bView.textContent = "🔼 收合範例";
        } else { skeletonBox.style.display = "none"; bView.textContent = "📖 展開範例構築"; }
      };
      bSeries.onclick = function () { loadSeries(seriesBox, d, bSeries); };
      bImport.onclick = function () { importMeta(d, mainList); };

      wrap.appendChild(card);
    });
  }

  function combineMeta(d) {
    const map = {};
    const order = [];
    (d.core || []).concat(d.engine || [], d.staples || []).forEach(function (c) {
      if (c.q <= 0) return;
      if (!map[c.id]) { map[c.id] = { id: c.id, n: c.n, q: 0 }; order.push(c.id); }
      map[c.id].q += c.q;
    });
    return order.map(function (id) { return map[id]; });
  }

  function buildMetaDetail(detail, d, mainList) {
    const mCount = mainList.reduce(function (a, x) { return a + x.q; }, 0);
    const eCount = (d.extra || []).reduce(function (a, x) { return a + x.q; }, 0);
    detail.appendChild(elem("h4", null, "主卡組（" + mCount + "）"));
    const g1 = elem("div", "grid small");
    mainList.forEach(function (c) { g1.appendChild(tile(c, { q: c.q })); });
    detail.appendChild(g1);
    if (d.extra && d.extra.length) {
      detail.appendChild(elem("h4", null, "額外卡組（" + eCount + "）"));
      const g2 = elem("div", "grid small");
      d.extra.forEach(function (c) { g2.appendChild(tile(c, { q: c.q })); });
      detail.appendChild(g2);
    }
  }

  async function loadSeries(box, d, btn) {
    // 已載入：切換顯示
    if (box.dataset.loaded) {
      if (box.style.display === "none") { box.style.display = "block"; btn.textContent = "🔼 收合系列"; }
      else { box.style.display = "none"; btn.textContent = "🗃️ 載入系列全卡"; }
      return;
    }
    box.style.display = "block";
    box.innerHTML = "";
    box.appendChild(elem("h4", null, "「" + esc(d.name) + "」系列全卡"));
    const status = elem("p", "status", "載入中…");
    box.appendChild(status);
    const g = elem("div", "grid small");
    box.appendChild(g);
    btn.disabled = true; btn.textContent = "載入中…";
    let cards = [];
    try { cards = await YGO.searchSeries(d.keywords); }
    catch (e) { status.textContent = "載入失敗：" + e.message + "（請確認網路連線）"; btn.disabled = false; btn.textContent = "🗃️ 載入系列全卡"; return; }
    status.textContent = "共 " + cards.length + " 張（點卡看完整中文效果，＋加入卡組）";
    cards.forEach(function (c) { g.appendChild(tile(c)); });
    box.dataset.loaded = "1";
    btn.disabled = false; btn.textContent = "🔼 收合系列";
  }

  function importMeta(d, mainList) {
    const next = { main: mainList.map(cp), extra: (d.extra || []).map(cp), side: [] };
    Deck.set(next);
    toast("已匯入「" + d.name + "」到我的卡組");
    openDrawer();
  }
  function cp(c) { return { id: c.id, n: c.n, q: c.q }; }

  /* ---------- 生成器 ---------- */
  function initBuilder() {
    const sel = $("#b-archetype");
    BUILDER_ARCHETYPES.forEach(function (a) {
      const o = elem("option"); o.value = a.key; o.textContent = a.label; sel.appendChild(o);
    });
    bindRange("#b-size", "#b-size-out");
    bindRange("#b-ht", "#b-ht-out");
    bindRange("#b-bk", "#b-bk-out");
    sel.onchange = function () {
      const eng = ENGINES[sel.value];
      if (eng && eng.recommend) {
        $("#b-ht").value = eng.recommend.handtraps; $("#b-ht-out").value = eng.recommend.handtraps;
        $("#b-bk").value = eng.recommend.breakers; $("#b-bk-out").value = eng.recommend.breakers;
      }
    };
    $("#b-generate").onclick = generate;
  }
  function bindRange(inSel, outSel) {
    const i = $(inSel), o = $(outSel);
    i.oninput = function () { o.value = i.value; };
  }

  function generate() {
    const opts = {
      archetype: $("#b-archetype").value,
      style: $("#b-style").value,
      budget: $("#b-budget").value,
      size: Number($("#b-size").value),
      handtraps: Number($("#b-ht").value),
      breakers: Number($("#b-bk").value),
    };
    const deck = Builder.build(opts);
    renderBuilderOutput(deck, opts);
  }

  function renderBuilderOutput(deck, opts) {
    const out = $("#builder-output");
    out.innerHTML = "";
    const panel = elem("div", "card-panel");
    const eng = ENGINES[opts.archetype];
    const mCount = deck.main.reduce(function (a, x) { return a + x.q; }, 0);
    const eCount = deck.extra.reduce(function (a, x) { return a + x.q; }, 0);
    panel.appendChild(elem("h2", null, "生成結果：" + esc(eng.name)));
    panel.appendChild(elem("p", "status",
      "主卡組 " + mCount + " 張 · 額外 " + eCount + " 張 · 手坑 " + opts.handtraps + " · 破壞卡 " + opts.breakers +
      " · 預算 " + ({ high: "不限", mid: "中等", low: "省錢" }[opts.budget])));
    if (deck.notes && deck.notes.length)
      deck.notes.forEach(function (n) { panel.appendChild(elem("p", "note-line", "· " + esc(n))); });

    const acts = elem("div", "meta-acts");
    const bImport = elem("button", "primary", "⬇️ 匯入到我的卡組");
    bImport.onclick = function () { Deck.set({ main: deck.main.map(cp), extra: deck.extra.map(cp), side: deck.side.map(cp) }); toast("已匯入生成卡組"); openDrawer(); };
    const bRe = elem("button", null, "🔄 重新生成");
    bRe.onclick = generate;
    acts.appendChild(bImport); acts.appendChild(bRe);
    panel.appendChild(acts);

    section(panel, "主卡組（" + mCount + "）", deck.main);
    if (deck.extra.length) section(panel, "額外卡組（" + eCount + "）", deck.extra);
    if (deck.side.length) section(panel, "副卡組（示意）", deck.side);
    out.appendChild(panel);
    out.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function section(parent, title, list) {
    parent.appendChild(elem("h4", null, title));
    const g = elem("div", "grid small");
    list.forEach(function (c) { g.appendChild(tile(c, { q: c.q })); });
    parent.appendChild(g);
  }

  /* ---------- 我的卡組抽屜 ---------- */
  function openDrawer() { $("#deck-drawer").setAttribute("aria-hidden", "false"); renderDeck(); }
  function closeDrawer() { $("#deck-drawer").setAttribute("aria-hidden", "true"); }

  function renderDeck() {
    const s = Deck.get();
    $("#deck-count").textContent = Deck.count("main") + Deck.count("extra") + Deck.count("side");
    const summary = $("#deck-summary");
    summary.innerHTML =
      "主 <b>" + Deck.count("main") + "</b> · 額外 <b>" + Deck.count("extra") + "</b> · 副 <b>" + Deck.count("side") + "</b>";
    const v = Deck.validate();
    const vEl = $("#deck-validate");
    vEl.className = "deck-validate " + (v.ok ? "ok" : "warn");
    vEl.innerHTML = v.ok ? "✅ 卡組合法（40–60 主卡組）" : "⚠️ " + v.msgs.map(esc).join("；");
    const body = $("#deck-body");
    body.innerHTML = "";
    [["主卡組", "main"], ["額外卡組", "extra"], ["副卡組", "side"]].forEach(function (pair) {
      const arr = s[pair[1]];
      if (!arr.length) return;
      body.appendChild(elem("h4", null, pair[0] + "（" + Deck.count(pair[1]) + "）"));
      arr.forEach(function (x) {
        const row = elem("div", "deck-row");
        const im = imgEl(x.id, x.n); im.className = "card-img thumb";
        im.onclick = function () { openCardModal(x.id); };
        row.appendChild(im);
        row.appendChild(elem("span", "deck-name", esc(x.n)));
        const ctrl = elem("div", "deck-ctrl");
        const minus = elem("button", null, "−"); minus.onclick = function () { Deck.sub(x.id, pair[1]); };
        const qty = elem("span", "deck-q", "×" + x.q);
        const plus = elem("button", null, "＋"); plus.onclick = function () { addToDeck(x.id, x.n); };
        ctrl.appendChild(minus); ctrl.appendChild(qty); ctrl.appendChild(plus);
        row.appendChild(ctrl);
        body.appendChild(row);
      });
    });
    if (!s.main.length && !s.extra.length && !s.side.length)
      body.innerHTML = "<p class='status'>還沒有卡片。可從「卡片搜索」點＋、或在「流行構築 / 生成器」匯入整副。</p>";
  }

  /* ---------- 匯出 ---------- */
  function download(name, text) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const a = elem("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); toast("已複製到剪貼簿"); }
    catch (e) {
      const ta = elem("textarea"); ta.value = text; document.body.appendChild(ta);
      ta.select(); try { document.execCommand("copy"); toast("已複製"); } catch (e2) { toast("複製失敗，請手動選取"); }
      ta.remove();
    }
  }

  /* ---------- toast ---------- */
  let toastTimer = null;
  function toast(msg) {
    let t = $("#toast");
    if (!t) { t = elem("div", "toast"); t.id = "toast"; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 1800);
  }

  /* ---------- 分頁 ---------- */
  function initTabs() {
    $all(".tab").forEach(function (btn) {
      btn.onclick = function () {
        $all(".tab").forEach(function (b) { b.classList.remove("active"); });
        $all(".tab-panel").forEach(function (p) { p.classList.remove("active"); });
        btn.classList.add("active");
        $("#tab-" + btn.dataset.tab).classList.add("active");
      };
    });
  }

  function init() {
    initTabs();
    initBuilder();
    renderMetaList();

    $("#q-btn").onclick = function () { runSearch($("#q").value); };
    $("#q").addEventListener("keydown", function (e) { if (e.key === "Enter") runSearch($("#q").value); });
    $all(".qbtn").forEach(function (b) { b.onclick = function () { $("#q").value = b.dataset.q; runSearch(b.dataset.q); }; });
    $all("#kind-chips .chip").forEach(function (c) {
      c.onclick = function () {
        $all("#kind-chips .chip").forEach(function (x) { x.classList.remove("active"); });
        c.classList.add("active"); kindFilter = c.dataset.kind; renderSearch();
      };
    });

    $("#deck-btn").onclick = openDrawer;
    $("#deck-close").onclick = closeDrawer;
    $("#drawer-scrim").onclick = closeDrawer;
    $("#deck-clear").onclick = function () { if (confirm("確定清空我的卡組？")) Deck.clear(); };
    $("#export-ydk").onclick = function () { download("mydeck.ydk", Deck.toYdk()); };
    $("#export-txt").onclick = function () { copyText(Deck.toText()); };

    $("#modal-scrim").onclick = closeModal;
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeModal(); } });

    Deck.onChange(function () { renderDeck(); });
    renderDeck();
  }

  return { init: init };
})();
