import { renderCardCard } from './cardView.js';

export function initCardsTab({ db, setsData, getEditingDeckId, deckStore, refreshDeckUI }) {
  const root = document.getElementById('tab-cards');

  // 卡包／系列下拉選單：從目前卡池實際出現過的 set 代碼收集（不是列出sets.json裡全部
  // 定義過的系列，避免出現選了卻一張卡都沒有的空選項），依代碼排序；有對應的系列名稱
  // 就一起顯示，方便辨認。
  const setCodesInPool = [...new Set(db.allCards().map((c) => c.set).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'ja')
  );
  const setsByCode = new Map((setsData?.sets || []).map((s) => [s.code, s]));
  const setOptionsHtml = setCodesInPool
    .map((code) => {
      const setInfo = setsByCode.get(code);
      const label = setInfo ? `${code}｜${setInfo.name}` : code;
      return `<option value="${code}">${label}</option>`;
    })
    .join('');

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
      <select id="card-set-filter">
        <option value="all">全部卡包／系列</option>
        ${setOptionsHtml}
      </select>
      <label class="chk"><input type="checkbox" id="card-collab-filter" /> 只看合作卡</label>
      <label class="chk"><input type="checkbox" id="card-awoken-filter" /> 顯示轉醒背面卡（僅供查閱，不能直接加入卡組）</label>
    </div>
    <p class="hint" id="card-count-hint">目前為系統示範卡池（含1組虛構合作卡示範、轉醒／煌臨／究極系統示範卡）。要加入卡組請先到「卡組編輯」分頁建立/選擇一副卡組。</p>
    <div id="card-grid" class="bs-card-grid"></div>
    <div id="card-load-more-wrap" style="text-align:center;margin:16px 0;"></div>
  `;

  const grid = root.querySelector('#card-grid');
  const countHint = root.querySelector('#card-count-hint');
  const loadMoreWrap = root.querySelector('#card-load-more-wrap');
  const searchEl = root.querySelector('#card-search');
  const typeEl = root.querySelector('#card-type-filter');
  const colorEl = root.querySelector('#card-color-filter');
  const setEl = root.querySelector('#card-set-filter');
  const collabEl = root.querySelector('#card-collab-filter');
  const awokenEl = root.querySelector('#card-awoken-filter');

  // 卡池已成長到上萬張，一次把符合條件的卡全部畫成DOM節點＋外部卡圖請求會非常卡，
  // 所以改成每次只畫一批（PAGE_SIZE），捲到底再用「顯示更多」按鈕載入下一批。
  const PAGE_SIZE = 60;
  let shownCount = PAGE_SIZE;
  let debounceTimer = null;

  function renderNow() {
    const q = searchEl.value.trim().toLowerCase();
    const type = typeEl.value;
    const color = colorEl.value;
    const setFilter = setEl.value;
    const collabOnly = collabEl.checked;
    const showAwoken = awokenEl.checked;
    const editingId = getEditingDeckId();

    const list = db.allCards().filter((c) => {
      if (!showAwoken && c.awokenForm) return false;
      if (type !== 'all' && c.type !== type) return false;
      if (color !== 'all' && !(c.colors || []).includes(color)) return false;
      if (setFilter !== 'all' && c.set !== setFilter) return false;
      if (collabOnly && !c.collab) return false;
      if (q && !(c.name.toLowerCase().includes(q) || (c.text || '').toLowerCase().includes(q))) return false;
      return true;
    });

    const visible = list.slice(0, shownCount);
    countHint.textContent = `符合條件共 ${list.length} 張，目前顯示 ${visible.length} 張。要加入卡組請先到「卡組編輯」分頁建立/選擇一副卡組。`;

    grid.innerHTML = '';
    for (const card of visible) {
      const deck = editingId ? deckStore.get(editingId) : null;
      const entry = deck ? deck.main.find((e) => e.id === card.id) : null;
      const el = renderCardCard(card, {
        showQty: entry ? entry.qty : editingId ? 0 : null,
        isContractSelected: deck ? deck.contractCardId === card.id : false,
        onAdd: editingId
          ? () => {
              deckStore.addCard(editingId, card.id, 1);
              renderNow();
              refreshDeckUI();
            }
          : () => alert('請先到「卡組編輯」分頁建立或選擇一副要編輯的卡組。'),
        onAddContract: editingId
          ? () => {
              // 契約卡本身就是主卡組40張的一部分：如果還沒加進卡組，先加1張，
              // 再把它指定為「開局公開加入手牌」的那一張。
              const deck = deckStore.get(editingId);
              if (!deck.main.some((e) => e.id === card.id)) {
                deckStore.addCard(editingId, card.id, 1);
              }
              deckStore.update(editingId, { contractCardId: card.id });
              renderNow();
              refreshDeckUI();
            }
          : () => alert('請先到「卡組編輯」分頁建立或選擇一副要編輯的卡組。'),
      });
      grid.appendChild(el);
    }
    if (list.length === 0) grid.innerHTML = '<p class="hint">沒有符合條件的卡片。</p>';

    loadMoreWrap.innerHTML = '';
    if (list.length > shownCount) {
      const btn = document.createElement('button');
      btn.textContent = `顯示更多（還有 ${list.length - shownCount} 張）`;
      btn.onclick = () => {
        shownCount += PAGE_SIZE;
        renderNow();
      };
      loadMoreWrap.appendChild(btn);
    }
  }

  function render() {
    // 篩選條件變動時要從頭開始顯示，不然舊的捲動位置對應不上新結果
    shownCount = PAGE_SIZE;
    renderNow();
  }

  function debouncedRender() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(render, 200);
  }

  searchEl.oninput = debouncedRender;
  typeEl.onchange = render;
  colorEl.onchange = render;
  setEl.onchange = render;
  collabEl.onchange = render;
  awokenEl.onchange = render;
  render();

  return { render };
}
