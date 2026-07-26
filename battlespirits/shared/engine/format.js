export const FORMATS = {
  standard: { id: 'standard', label: '標準賽 Standard', desc: '僅輪替期間內發售的系列可用，另受標準賽禁限表限制。' },
  eternal: { id: 'eternal', label: '永恆賽 Eternal（舊稱大師賽 Master）', desc: '不限系列年份，全部歷年卡片皆可用，僅受永恆賽禁限表限制。' },
  unlimited: { id: 'unlimited', label: '無制限 Unlimited（自由／娛樂對戰）', desc: '不做輪替與禁限表檢查，僅保留基本張數規則，適合朋友間自由對戰。' },
};

export const DECK_RULES = {
  mainDeckMin: 40,
  maxCopiesDefault: 3,
};

// deck: { name, format, main: [{id, qty}], contractCardId?: string }
// db: createCardDatabase() 的回傳物件
//
// 契約卡（Contract）規則（依官方規則手冊校正）：契約卡本身就是主卡組40張的
// 一部分（不是額外的第41張），只是遊戲開始洗牌前可以先抽出1張背面展示，
// 抽手牌時改成「抽3張＋公開加入這1張＝一樣是4張起始手牌」，而不是「抽4張
// 後再多塞1張」。這件事完全是可選的：deck.contractCardId 有值就代表「這副
// 卡組要使用這個特性」，null 就代表「契約卡直接洗進卡組，正常抽牌」。
// 一副卡組只能收錄同一種契約卡（最多3張同名，跟一般卡片同一套張數限制）。
export function validateDeck(deck, db) {
  const errors = [];
  const warnings = [];

  if (!FORMATS[deck.format]) {
    errors.push(`未知賽制: ${deck.format}`);
    return { valid: false, errors, warnings };
  }

  let total = 0;
  const seen = new Map();
  const contractCardNamesInMain = new Set();

  for (const entry of deck.main) {
    let card;
    try {
      card = db.getCard(entry.id);
    } catch {
      errors.push(`卡組內含未知卡片編號: ${entry.id}`);
      continue;
    }
    if (entry.qty <= 0) {
      errors.push(`${card.name} 張數必須大於 0`);
      continue;
    }
    total += entry.qty;
    seen.set(entry.id, (seen.get(entry.id) || 0) + entry.qty);

    if (card.contractCard) {
      contractCardNamesInMain.add(entry.id);
    }

    if (!db.isCardLegal(entry.id, deck.format)) {
      errors.push(`${card.name}（${entry.id}）在「${FORMATS[deck.format].label}」中不合法（輪替範圍外或已被禁止）`);
    }

    const maxCopies = db.maxCopiesFor(entry.id, deck.format);
    if ((seen.get(entry.id) || 0) > maxCopies) {
      errors.push(`${card.name} 超過張數限制（最多 ${maxCopies} 張）`);
    }
  }

  if (contractCardNamesInMain.size > 1) {
    const names = [...contractCardNamesInMain].map((id) => db.getCard(id).name).join('、');
    errors.push(`卡組只能收錄同一種契約卡，目前混入了多種：${names}`);
  }

  let contractCard = null;
  if (deck.contractCardId) {
    try {
      contractCard = db.getCard(deck.contractCardId);
      if (!contractCard.contractCard) {
        errors.push(`${contractCard.name} 不是契約卡，不能指定為開局公開的契約卡`);
      } else if (!db.isCardLegal(deck.contractCardId, deck.format)) {
        errors.push(`${contractCard.name}（${deck.contractCardId}）在「${FORMATS[deck.format].label}」中不合法`);
      } else if (!contractCardNamesInMain.has(deck.contractCardId)) {
        errors.push(`${contractCard.name} 要先放進主卡組（main）裡至少1張，才能指定為開局公開的契約卡`);
      }
    } catch {
      errors.push(`未知的契約卡編號: ${deck.contractCardId}`);
    }
  }

  if (total < DECK_RULES.mainDeckMin) {
    errors.push(`主卡組張數不足，至少需要 ${DECK_RULES.mainDeckMin} 張（目前 ${total} 張）`);
  }

  if (total !== DECK_RULES.mainDeckMin) {
    warnings.push(`主卡組張數為 ${total} 張，官方標準構築通常剛好 ${DECK_RULES.mainDeckMin} 張，非必要但建議調整。`);
  }

  return { valid: errors.length === 0, errors, warnings, total, contractCard };
}
