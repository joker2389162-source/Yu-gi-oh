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
let cardsUIRef = null;
tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    switchTab(btn.dataset.tab);
    if (btn.dataset.tab === 'play' && playUIRef && !playUIRef.hasMatch()) playUIRef.renderSetup();
    // 切到「卡片資料庫」分頁時要重新 render：editingDeckId 可能在「卡組編輯」
    // 分頁被改過（新增/匯入/切換卡組），卡片頁的按鈕（加入卡組／設為開局公開
    // 的契約卡）需要用最新的 editingDeckId 才能正確運作，不然按鈕還是綁著
    // 上一次 render 當下（可能是「尚未選擇卡組」）的舊狀態。
    if (btn.dataset.tab === 'cards' && cardsUIRef) cardsUIRef.render();
  });
});

async function main() {
  const statusEl = document.getElementById('load-status');
  try {
    const { db, startersData } = await loadDatabase();
    statusEl.remove();

    let editingDeckId = null;
    cardsUIRef = initCardsTab({
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
