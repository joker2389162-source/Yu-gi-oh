// 卡片資料庫：對 cards.json / sets.json / banlist.json 做索引與合法性判斷。
// 刻意不直接 import JSON（Node ESM 的 JSON import 語法在不同版本差異大，
// 瀏覽器端則要用 fetch），改用依賴注入方式讓 server/client 各自載入資料後傳入。

export function createCardDatabase({ cardsData, setsData, banlistData }) {
  const cardsById = new Map();
  for (const c of cardsData.cards) cardsById.set(c.id, c);

  const setsByCode = new Map();
  for (const s of setsData.sets) setsByCode.set(s.code, s);

  const standardCutoff = new Date(setsData.standardRotation.cutoffDate);

  function getCard(id) {
    const c = cardsById.get(id);
    if (!c) throw new Error(`未知卡片編號: ${id}`);
    return c;
  }

  function allCards() {
    return cardsData.cards;
  }

  function getSet(code) {
    return setsByCode.get(code) || null;
  }

  function banEntry(cardId, format) {
    const list = banlistData[format] || [];
    return list.find((e) => e.cardId === cardId) || null;
  }

  // 判斷單張卡在指定賽制下是否合法可用。
  // format: 'standard' | 'eternal' | 'unlimited'
  function isCardLegal(cardId, format) {
    if (format === 'unlimited') return true; // 無制限：無輪替、無禁限，僅娛樂規則

    const card = getCard(cardId);
    const set = getSet(card.set);
    const ban = banEntry(cardId, format);
    if (ban && ban.status === 'banned') return false;

    if (format === 'eternal') {
      // 永恆賽（舊稱大師賽）：全卡皆可用，只看禁限表
      return true;
    }

    if (format === 'standard') {
      if (!set) return false;
      if (set.standardLegal === false) return false;

      if (card.blockIcon) {
        // 官方真正的標準賽判定依據：卡片印刷面的「區塊圖示」是英文字母才能用，
        // 且要落在該字母對應的官方公告輪替期間內（《官方規則手冊[STANDARD]》
        // 第7頁）。區塊圖示是數字或沒有區塊圖示＝僅永恆賽可用，不是標準賽。
        const letter = String(card.blockIcon).replace(/[<>\s]/g, '');
        if (!/^[A-Za-z]+$/.test(letter)) return false;
        const window = setsData.standardRotation.blockWindows?.[letter];
        if (!window) return false;
        const now = new Date();
        if (now < new Date(window.from) || now > new Date(window.to)) return false;
        return true;
      }

      // 沒有 blockIcon 資料的卡（目前僅示範卡池）：退回舊有的「依系列發售
      // 日期」簡化判斷，等示範卡池補上 blockIcon 後這個分支可以整個移除。
      const releaseDate = new Date(set.releaseDate);
      if (releaseDate < standardCutoff) return false;
      return true;
    }

    throw new Error(`未知賽制: ${format}`);
  }

  function maxCopiesFor(cardId, format) {
    // 契約卡跟一般卡片同一套張數限制（最多3張），不是只能1張——這是先前的
    // 錯誤假設：官方規則書FAQ明講「契約卡合計最多只能放入3張」，見
    // shared/data/cards.json schema 裡 contractCard 欄位的說明。
    const ban = banEntry(cardId, format);
    if (ban && ban.status === 'limited1') return 1;
    return 3;
  }

  return { getCard, allCards, getSet, isCardLegal, maxCopiesFor, banEntry };
}
