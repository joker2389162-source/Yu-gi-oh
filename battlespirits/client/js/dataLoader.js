import { createCardDatabase } from '../../shared/engine/cardDatabase.js';

export async function loadDatabase() {
  const [cardsData, setsData, banlistData, startersData] = await Promise.all([
    fetch('../shared/data/cards.json').then((r) => r.json()),
    fetch('../shared/data/sets.json').then((r) => r.json()),
    fetch('../shared/data/banlist.json').then((r) => r.json()),
    fetch('../shared/data/starters.json').then((r) => r.json()),
  ]);
  const db = createCardDatabase({ cardsData, setsData, banlistData });
  return { db, startersData, setsData };
}
