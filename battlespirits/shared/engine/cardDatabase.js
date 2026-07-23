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
      const releaseDate = new Date(set.releaseDate);
      if (releaseDate < standardCutoff) return false;
      return true;
    }

    throw new Error(`未知賽制: ${format}`);
  }

  function maxCopiesFor(cardId, format) {
    const card = getCard(cardId);
    if (card.contractCard) return 1;
    const ban = banEntry(cardId, format);
    if (ban && ban.status === 'limited1') return 1;
    return 3;
  }

  return { getCard, allCards, getSet, isCardLegal, maxCopiesFor, banEntry };
}
