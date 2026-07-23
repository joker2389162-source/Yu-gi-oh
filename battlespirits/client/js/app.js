import { loadDatabase } from './dataLoader.js';
import { deckStore } from './deckStore.js';
import { initCardsTab } from './cardsUI.js';
import { initDeckTab } from './deckUI.js';
import { initPlayTab } from './playUI.js';

const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

function switchTab(name) {
  tabButtons.forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  tabPanels.forEach((p) => p.classList.toggle('active', p.id === `tab-${name}`));
}

let playUIRef = null;
tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    switchTab(btn.dataset.tab);
    if (btn.dataset.tab === 'play' && playUIRef && !playUIRef.hasMatch()) playUIRef.renderSetup();
  });
});

async function main() {
  const statusEl = document.getElementById('load-status');
  try {
    const { db, startersData } = await loadDatabase();
    statusEl.remove();

    let editingDeckId = null;
    const cardsUIRef = initCardsTab({
      db,
      deckStore,
      getEditingDeckId: () => editingDeckId,
      refreshDeckUI: () => deckUIRef.renderEditor(),
    });
    const deckUIRef = initDeckTab({
      db,
      deckStore,
      startersData,
      getEditingDeckId: () => editingDeckId,
      setEditingDeckId: (id) => {
        editingDeckId = id;
      },
      cardsUIRef,
    });
    playUIRef = initPlayTab({ db, deckStore, startersData });
  } catch (err) {
    statusEl.textContent = '資料載入失敗：' + err.message + '（請確認是透過 http server 開啟，而不是直接雙擊 index.html）';
    statusEl.classList.add('error');
    console.error(err);
  }
}

main();
