/*
 * API 層：封裝 ygocdb.com 中文卡庫查詢與 ygoprodeck 卡圖，附 localStorage 快取。
 * 全部為跨域 GET，ygocdb 回應帶 Access-Control-Allow-Origin: *，可直接於瀏覽器（含 file://）使用。
 */
const YGO = (function () {
  const API = "https://ygocdb.com/api/v0/?search=";
  const IMG = "https://images.ygoprodeck.com/images/cards/";
  const IMG_SMALL = "https://images.ygoprodeck.com/images/cards_small/";
  const CACHE_KEY = "ygo_card_cache_v1";

  // 記憶體 + localStorage 卡片快取（key = id）
  let mem = {};
  try { mem = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); } catch (e) { mem = {}; }
  let saveTimer = null;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(mem)); } catch (e) {}
    }, 400);
  }

  function imgUrl(id, small) { return (small ? IMG_SMALL : IMG) + id + ".jpg"; }

  // 正規化 ygocdb 卡片物件為內部格式
  function norm(x) {
    const t = (x.text && x.text.types) || "";
    const first = t.split("\n")[0] || "";
    const d = x.data || {};
    const card = {
      id: x.id,
      cid: x.cid,
      name: x.cn_name || x.sc_name || x.jp_name || String(x.id),
      jp: x.jp_name || "",
      en: x.en_name || "",
      typeLine: first,
      desc: (x.text && x.text.desc) || "",
      pdesc: (x.text && x.text.pdesc) || "",
      // 靈擺怪的 level 欄位打包了刻度（如 0x04040007＝等級7/刻度4），取低位得真實等級
      atk: d.atk, def: d.def, level: (d.level != null ? (d.level & 0xff) : d.level),
      race: d.race, attribute: d.attribute, typeBits: d.type,
    };
    card.kind = classify(first);   // monster / spell / trap
    // 由類型行解析中文「種族/屬性」（例：「不死/炎」）供進階篩選
    const rm = first.match(/\]\s*([^\s\/\[\]]+)\/([^\s\/\[\]]+)\s*$/);
    if (rm && card.kind === "monster") { card.raceCN = rm[1]; card.attrCN = rm[2]; }
    card.isLink = /连接|連接|LINK/i.test(first);
    card.isXyz = /超量|XYZ/i.test(first);
    mem[x.id] = card;
    persist();
    return card;
  }

  function classify(typeLine) {
    if (typeLine.indexOf("怪兽") >= 0 || typeLine.indexOf("怪獸") >= 0) return "monster";
    if (typeLine.indexOf("陷阱") >= 0) return "trap";
    if (typeLine.indexOf("魔法") >= 0) return "spell";
    return "other";
  }

  async function raw(term) {
    const res = await fetch(API + encodeURIComponent(term), { method: "GET" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  // 關鍵字搜尋 -> 卡片陣列
  async function search(term) {
    const data = await raw(term);
    return (data.result || []).map(norm);
  }

  // 依卡密取單卡（快取優先）
  async function getById(id) {
    if (mem[id]) return mem[id];
    const data = await raw(String(id));
    const hit = (data.result || []).find(function (x) { return x.id === Number(id); }) || (data.result || [])[0];
    return hit ? norm(hit) : null;
  }

  // 批次依卡密取卡（限制併發，快取優先）
  async function getMany(ids) {
    const uniq = Array.from(new Set(ids));
    const out = {};
    const todo = [];
    uniq.forEach(function (id) { if (mem[id]) out[id] = mem[id]; else todo.push(id); });
    const LIMIT = 6;
    let i = 0;
    async function worker() {
      while (i < todo.length) {
        const id = todo[i++];
        try { const c = await getById(id); if (c) out[id] = c; } catch (e) {}
      }
    }
    await Promise.all(Array.from({ length: Math.min(LIMIT, todo.length) }, worker));
    return out;
  }

  // 多關鍵字合併查系列（去重）
  // ygocdb 對系列關鍵字會回傳整個系列（含名字不含該詞的成員，如查「百夫长」也回「重骑士 普莉梅拉」）。
  // 因此預設信任 API 結果；只有當單一關鍵字回傳過多（>40，疑似模糊文字汙染）時，才退回名稱過濾。
  const FUZZY_THRESHOLD = 40;
  async function searchSeries(keywords) {
    const seen = {};
    const merged = [];
    for (const kw of keywords) {
      let arr = [];
      try { arr = await search(kw); } catch (e) { arr = []; }
      const polluted = arr.length > FUZZY_THRESHOLD;
      arr.forEach(function (c) {
        if (polluted) {
          const hit = keywords.some(function (k) { return c.name.indexOf(k) >= 0 || (c.jp && c.jp.indexOf(k) >= 0); });
          if (!hit) return;
        }
        if (!seen[c.id]) { seen[c.id] = 1; merged.push(c); }
      });
    }
    return merged;
  }

  return { imgUrl, search, getById, getMany, searchSeries, classify, _cache: mem };
})();
