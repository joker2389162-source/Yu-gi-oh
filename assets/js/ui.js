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
    cap.appendChild(elem("span", "tile-name", esc(S2T.disp(name))));
    if (item.typeLine) cap.appendChild(elem("span", "tile-type", esc(S2T.disp(item.typeLine))));
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
    toast(r.ok ? "已加入：" + S2T.disp(card.name) : r.msg);
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
    info.appendChild(elem("h3", null, esc(S2T.disp(card.name))));
    const meta = [];
    if (card.jp) meta.push(esc(card.jp));
    if (card.en) meta.push(esc(card.en));
    info.appendChild(elem("p", "modal-alt", meta.join(" ／ ")));
    info.appendChild(elem("p", "modal-typeline", esc(S2T.disp(card.typeLine))));
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
      panel.appendChild(elem("div", "modal-pdesc", "<strong>靈擺效果</strong><br>" + esc(S2T.disp(card.pdesc)).replace(/\n/g, "<br>")));
    }
    panel.appendChild(elem("div", "modal-desc", esc(S2T.disp(card.desc)).replace(/\n/g, "<br>")));
  }

  function closeModal() { $("#card-modal").setAttribute("aria-hidden", "true"); }

  /* ---------- 搜索 ---------- */
  let lastResults = [];
  let kindFilter = "all";

  let lastNameCount = 0;
  async function runSearch(term) {
    term = (term || "").trim();
    if (!term) return;
    const status = $("#search-status");
    const grid = $("#search-results");
    status.textContent = YGO.indexReady() ? "搜索「" + term + "」中…" : "首次載入完整卡庫（約 1.5MB，含效果全文）…";
    grid.innerHTML = "";
    const q = S2T.query(term);
    let res;
    try { res = await YGO.searchLocal(q); }
    catch (e) {
      // 索引載入失敗時回退線上卡名查詢
      try { const arr = await YGO.search(q); res = { cards: arr, nameCount: arr.length }; }
      catch (e2) { status.textContent = "搜索失敗：" + e2.message + "（請檢查網路連線）"; return; }
    }
    lastResults = res.cards;
    lastNameCount = res.nameCount;
    renderSearch();
  }

  function readFilters() {
    return {
      attr: $("#f-attr").value,
      race: $("#f-race").value,
      level: $("#f-level").value,
      atk: $("#f-atk").value === "" ? null : Number($("#f-atk").value),
      def: $("#f-def").value === "" ? null : Number($("#f-def").value),
    };
  }

  function passFilters(c, f) {
    if (kindFilter !== "all" && c.kind !== kindFilter) return false;
    if (f.attr && c.attrCN !== f.attr) return false;
    if (f.race && c.raceCN !== f.race) return false;
    if (f.level && Number(c.level) !== Number(f.level)) return false;
    if (f.atk != null) { if (c.atk == null || c.atk < 0 || c.atk < f.atk) return false; }
    if (f.def != null) { if (c.isLink || c.def == null || c.def < 0 || c.def < f.def) return false; }
    return true;
  }

  const RESULT_CAP = 300;
  function renderSearch() {
    const grid = $("#search-results");
    const status = $("#search-status");
    grid.innerHTML = "";
    const f = readFilters();
    const list = lastResults.filter(function (c) { return passFilters(c, f); });
    // 計算卡名/效果文本各多少（name hits 為 lastResults 前段）
    const nameSet = {};
    for (let i = 0; i < lastNameCount && i < lastResults.length; i++) nameSet[lastResults[i].id] = 1;
    const nameCnt = list.filter(function (c) { return nameSet[c.id]; }).length;
    const textCnt = list.length - nameCnt;
    status.textContent = "共 " + list.length + " 筆（卡名 " + nameCnt + " · 效果文本 " + textCnt + "）" +
      (list.length > RESULT_CAP ? " · 顯示前 " + RESULT_CAP : "");
    if (!list.length) { grid.innerHTML = "<p class='status'>沒有符合條件的卡片。可放寬篩選或按「重設」。</p>"; return; }
    list.slice(0, RESULT_CAP).forEach(function (c) { grid.appendChild(tile(c)); });
  }

  const ATTRS = ["光", "暗", "地", "水", "炎", "风", "神"];
  const RACES = ["战士", "魔法师", "天使", "恶魔", "不死", "机械", "水", "炎", "岩石", "鸟兽",
    "植物", "昆虫", "雷", "龙", "兽", "兽战士", "恐龙", "鱼", "海龙", "爬虫类",
    "念动力", "幻神兽", "创造神", "幻龙", "电子界", "幻想魔"];
  function populateFilters() {
    const fa = $("#f-attr"), fr = $("#f-race"), fl = $("#f-level");
    ATTRS.forEach(function (a) { const o = elem("option"); o.value = a; o.textContent = S2T.disp(a); fa.appendChild(o); });
    RACES.forEach(function (r) { const o = elem("option"); o.value = r; o.textContent = S2T.disp(r); fr.appendChild(o); });
    for (let i = 1; i <= 12; i++) { const o = elem("option"); o.value = i; o.textContent = i; fl.appendChild(o); }
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
    const box = $("#quick-themes");
    QUICK_THEMES.forEach(function (g) {
      const grp = elem("div", "qt-group");
      grp.appendChild(elem("span", "qt-label", esc(g.group)));
      g.items.forEach(function (it) {
        const b = elem("button", "qt-chip", esc(it.label));
        b.onclick = function () { $("#b-keyword").value = S2T.disp(it.kw); generate(); };
        grp.appendChild(b);
      });
      box.appendChild(grp);
    });
    bindRange("#b-size", "#b-size-out");
    bindRange("#b-extra", "#b-extra-out");
    $("#b-generate").onclick = generate;
    $("#b-keyword").addEventListener("keydown", function (e) { if (e.key === "Enter") generate(); });
  }
  function bindRange(inSel, outSel) {
    const i = $(inSel), o = $(outSel);
    i.oninput = function () { o.value = i.value; };
  }

  // 需求解析：從自由文字擷取風格／預算／張數／手坑偏好／策略流派／主題
  function parseIntent(raw) {
    const t = S2T.query(raw);   // 轉簡體便於比對
    const o = { style: "auto", budget: "high", handtraps: 12, breakers: 3, size: null, presetKey: null };
    if (/快攻|otk|爆发|先攻杀|一回合|速攻/i.test(t)) o.style = "aggro";
    else if (/控制|控场|防守|后手|耐久|长期|铁壁/.test(t)) o.style = "control";
    else if (/连招|展开|连锁|combo/i.test(t)) o.style = "combo";
    if (/便宜|省钱|平价|低价|新手|入门|穷|预算低/.test(t)) o.budget = "low";
    else if (/中价|中等预算/.test(t)) o.budget = "mid";
    if (/多手坑|手坑多|很多手坑|防手坑|重手坑/.test(t)) o.handtraps = 15;
    else if (/少手坑|无手坑|纯build|不放手坑/.test(t)) o.handtraps = 4;
    if (/多破坏|拆场多|后手强/.test(t)) o.breakers = 6;
    const sz = t.match(/(\d{2})\s*张/); if (sz) { const n = Number(sz[1]); if (n >= 40 && n <= 60) o.size = n; }
    // 策略流派關鍵詞
    if (/封锁|锁死|铁壁|站桩/.test(t)) o.presetKey = "封锁系";
    else if (/烧血|烧伤|灼烧|燃烧|烧脸|burn/i.test(t)) o.presetKey = "烧血流";
    else if (/手牌破坏|破坏手牌|弃牌|拆手|扒手/.test(t)) o.presetKey = "手牌破坏";
    else if (/墓地妨害|除外封锁|阴间|陰間|反墓地/.test(t)) o.presetKey = "阴间阻抗";
    else if (/报复社会|拆场恶心|反制流|恶心人/.test(t)) o.presetKey = "报复社会";
    else if (typeof presetFor === "function" && presetFor(t)) o.presetKey = t;
    // 主題：移除已辨識的需求詞，剩餘作為主題關鍵字
    let theme = t.replace(/快攻|otk|爆发|先攻杀|一回合|速攻|控制|控场|防守|后手|耐久|长期|铁壁|连招|展开|连锁|combo|便宜|省钱|平价|低价|新手|入门|穷|预算低|中价|中等预算|多手坑|手坑多|很多手坑|防手坑|重手坑|少手坑|无手坑|纯build|不放手坑|多破坏|拆场多|后手强|\d{2}\s*张|的|我要|想要|一套|一副|卡组|牌组|帮我|生成|做|要/gi, "").trim();
    o.theme = theme;
    return o;
  }

  async function generate() {
    const raw = $("#b-keyword").value.trim();
    const out = $("#builder-output");
    if (!raw) { toast("請輸入主題或你的需求（例：便宜的封鎖控制、青眼 後手OTK）"); return; }
    const intent = parseIntent(raw);
    const kw = intent.presetKey ? intent.presetKey : S2T.query(intent.theme || raw);
    const kwShow = S2T.disp(intent.presetKey || intent.theme || raw);
    const isPreset = (typeof presetFor === "function") && presetFor(kw);
    out.innerHTML = "<div class='card-panel'><p class='loading'>" +
      (YGO.indexReady() || isPreset ? "" : "首次載入完整卡庫（約 1.5MB，含效果全文）· ") +
      "解析需求「" + esc(S2T.disp(raw)) + "」、搜尋相關卡片、模擬對戰並挑選卡組中…</p></div>";
    let cards = [];
    if (!isPreset) {
      try { const r = await YGO.searchLocal(kw); cards = r.cards; }
      catch (e) {
        try { cards = await YGO.search(kw); } catch (e2) {
          out.innerHTML = "<div class='card-panel'><p class='status'>搜尋失敗：" + esc(e2.message) + "（請確認網路連線）</p></div>"; return;
        }
      }
      if (!cards.length) { out.innerHTML = "<div class='card-panel'><p class='status'>找不到「" + esc(kwShow) + "」的相關卡片，換個主題或說法試試（例：青眼、劍鬥獸、便宜的封鎖控制）。</p></div>"; return; }
    }
    const opts = {
      style: intent.style,
      budget: intent.budget,
      size: intent.size || Number($("#b-size").value),
      extraMax: Number($("#b-extra").value),
      handtraps: intent.handtraps,
      breakers: intent.breakers,
    };
    const threshold = Number($("#b-threshold").value) || 60;
    const result = Builder.buildBest(kw, cards, opts, threshold);
    result.intent = intent;
    renderBuilderOutput(result.deck, opts, kwShow, result);
  }

  function renderBuilderOutput(deck, opts, keyword, result) {
    const out = $("#builder-output");
    out.innerHTML = "";
    const panel = elem("div", "card-panel");
    const mCount = deck.main.reduce(function (a, x) { return a + x.q; }, 0);
    const eCount = deck.extra.reduce(function (a, x) { return a + x.q; }, 0);
    panel.appendChild(elem("h2", null, "生成結果：「" + esc(keyword) + "」"));

    // 模擬對戰勝率面板
    if (result && result.eval) {
      const ev = result.eval;
      const wr = Math.round(ev.winRate);
      const pass = wr >= (result.threshold || 60);
      const box = elem("div", "winrate " + (pass ? "pass" : "fail"));
      box.innerHTML =
        "<div class='wr-big'>估計勝率 <b>" + wr + "%</b> " + (pass ? "✅ 達標" : "⚠️ 未達標") + "</div>" +
        "<div class='wr-sub'>對手：主流卡組基準（" + esc(S2T.disp(ev.opponent || "meta")) + "） · 模擬 " + ev.games + " 局 · 嘗試 " + result.attempts + " 版取最佳</div>" +
        "<div class='wr-metrics'>先手可展開 " + Math.round(ev.openFirstRate != null ? ev.openFirstRate : ev.openRate) + "% · 後手可行動 " + Math.round(ev.openSecondRate != null ? ev.openSecondRate : ev.openRate) + "%" +
        " · 後手破場率 " + Math.round(ev.breakRate || 0) + "% · 卡手率 " + Math.round(ev.brickRate) + "%</div>" +
        "<div class='wr-metrics'>引擎怪 " + (ev.engineMons != null ? ev.engineMons : "-") + " 張 · 手坑 " + (ev.handtrapsN != null ? ev.handtrapsN : "-") + " · 破場卡 " + (ev.breakersN != null ? ev.breakersN : "-") + " · 引擎分 " + ev.engineScore + "</div>";
      panel.appendChild(box);
      panel.appendChild(elem("p", "note-line",
        "＊估計勝率＝起手牌蒙地卡羅模擬（先手5/後手6各半）＋能否鋪場·展開·破場·不卡手的評分，非逐卡完整對局；用於相對比較。"));
    }

    const t = deck.themed || {};
    panel.appendChild(elem("p", "status",
      "主卡組 " + mCount + " · 額外 " + eCount +
      " · 預算 " + ({ high: "不限", mid: "中等", low: "省錢" }[opts.budget]) +
      (deck.domAttr ? " · 主屬性 " + esc(S2T.disp(deck.domAttr)) : "")));
    const styleLabel = { combo: "連招", control: "控制", aggro: "快攻", midrange: "中速" }[deck.effStyle] || deck.effStyle;
    panel.appendChild(elem("p", "status",
      "偵測到主題卡：主怪 " + (t.mons || 0) + " · 魔法 " + (t.spells || 0) + " · 陷阱 " + (t.traps || 0) + " · 額外 " + (t.extras || 0) +
      (deck.mode === "archetype" ? "（系列模式）" : "（相關卡 Goodstuff 模式）") +
      (styleLabel ? " · " + (opts.style === "auto" ? "偵測風格：" : "風格：") + styleLabel : "")));
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
        row.appendChild(elem("span", "deck-name", esc(S2T.disp(x.n))));
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

    populateFilters();
    $("#adv-toggle").onclick = function () {
      const box = $("#adv-filters");
      box.hidden = !box.hidden;
      $("#adv-toggle").classList.toggle("active", !box.hidden);
    };
    ["#f-attr", "#f-race", "#f-level"].forEach(function (s) { $(s).onchange = renderSearch; });
    ["#f-atk", "#f-def"].forEach(function (s) { $(s).oninput = renderSearch; });
    $("#f-reset").onclick = function () {
      ["#f-attr", "#f-race", "#f-level"].forEach(function (s) { $(s).value = ""; });
      $("#f-atk").value = ""; $("#f-def").value = "";
      renderSearch();
    };

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
