import { renderCardCard } from './cardView.js';

export function initCardsTab({ db, getEditingDeckId, deckStore, refreshDeckUI }) {
  const root = document.getElementById('tab-cards');
  root.innerHTML = `
    <div class="toolbar">
      <input id="card-search" type="search" placeholder="搜尋卡名或效果文字關鍵字" />
      <select id="card-type-filter">
        <option value="all">全部種類</option>
        <option value="spirit">精靈</option>
        <option value="nexus">據點</option>
        <option value="magic">魔法</option>
        <option value="ultimate">究極</option>
      </select>
      <select id="card-color-filter">
        <option value="all">全部顏色</option>
        <option value="white">白</option>
        <option value="red">赤</option>
        <option value="yellow">黃</option>
        <option value="blue">藍</option>
        <option value="green">綠</option>
        <option value="purple">紫</option>
      </select>
      <label class="chk"><input type="checkbox" id="card-collab-filter" /> 只看合作卡</label>
      <label class="chk"><input type="checkbox" id="card-awoken-filter" /> 顯示轉醒背面卡（僅供查閱，不能直接加入卡組）</label>
    </div>
    <p class="hint">目前為系統示範卡池（含1組虛構合作卡示範、轉醒／煌臨／究極系統示範卡）。要加入卡組請先到「卡組編輯」分頁建立/選擇一副卡組。</p>
    <div id="card-grid" class="bs-card-grid"></div>
  `;

  const grid = root.querySelector('#card-grid');
  const searchEl = root.querySelector('#card-search');
  const typeEl = root.querySelector('#card-type-filter');
  const colorEl = root.querySelector('#card-color-filter');
  const collabEl = root.querySelector('#card-collab-filter');
  const awokenEl = root.querySelector('#card-awoken-filter');

  function render() {
    const q = searchEl.value.trim().toLowerCase();
    const type = typeEl.value;
    const color = colorEl.value;
    const collabOnly = collabEl.checked;
    const showAwoken = awokenEl.checked;
    const editingId = getEditingDeckId();

    const list = db.allCards().filter((c) => {
      if (!showAwoken && c.awokenForm) return false;
      if (type !== 'all' && c.type !== type) return false;
      if (color !== 'all' && !(c.colors || []).includes(color)) return false;
      if (collabOnly && !c.collab) return false;
      if (q && !(c.name.toLowerCase().includes(q) || (c.text || '').toLowerCase().includes(q))) return false;
      return true;
    });

    grid.innerHTML = '';
    for (const card of list) {
      const deck = editingId ? deckStore.get(editingId) : null;
      const entry = deck ? deck.main.find((e) => e.id === card.id) : null;
      const el = renderCardCard(card, {
        showQty: entry ? entry.qty : editingId ? 0 : null,
        onAdd: editingId
          ? () => {
              deckStore.addCard(editingId, card.id, 1);
              render();
              refreshDeckUI();
            }
          : () => alert('請先到「卡組編輯」分頁建立或選擇一副要編輯的卡組。'),
        onAddContract: editingId
          ? () => {
              deckStore.update(editingId, { contractCardId: card.id });
              render();
              refreshDeckUI();
            }
          : () => alert('請先到「卡組編輯」分頁建立或選擇一副要編輯的卡組。'),
      });
      grid.appendChild(el);
    }
    if (list.length === 0) grid.innerHTML = '<p class="hint">沒有符合條件的卡片。</p>';
  }

  searchEl.oninput = render;
  typeEl.onchange = render;
  colorEl.onchange = render;
  collabEl.onchange = render;
  awokenEl.onchange = render;
  render();

  return { render };
}
