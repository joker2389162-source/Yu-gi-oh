const KEY = 'bs_decks_v1';

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(decks) {
  localStorage.setItem(KEY, JSON.stringify(decks));
}

let cache = load();

export const deckStore = {
  all() {
    return cache;
  },
  get(id) {
    return cache.find((d) => d.id === id) || null;
  },
  create(name, format) {
    const deck = { id: `deck_${Date.now()}_${Math.floor(Math.random() * 1000)}`, name, format, main: [], contractCardId: null };
    cache.push(deck);
    save(cache);
    return deck;
  },
  cloneFrom(source, newName) {
    const deck = {
      id: `deck_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      name: newName,
      format: source.format,
      main: source.main.map((e) => ({ ...e })),
      contractCardId: source.contractCardId || null,
    };
    cache.push(deck);
    save(cache);
    return deck;
  },
  update(id, patch) {
    const d = this.get(id);
    if (!d) return null;
    Object.assign(d, patch);
    save(cache);
    return d;
  },
  remove(id) {
    cache = cache.filter((d) => d.id !== id);
    save(cache);
  },
  addCard(deckId, cardId, delta = 1) {
    const d = this.get(deckId);
    if (!d) return;
    const entry = d.main.find((e) => e.id === cardId);
    if (entry) {
      entry.qty = Math.max(0, entry.qty + delta);
      if (entry.qty === 0) d.main = d.main.filter((e) => e.id !== cardId);
    } else if (delta > 0) {
      d.main.push({ id: cardId, qty: delta });
    }
    save(cache);
  },
};
