import { validateDeck, FORMATS } from '../../shared/engine/format.js';

export function initDeckTab({ db, deckStore, startersData, setEditingDeckId, getEditingDeckId, cardsUIRef }) {
  const root = document.getElementById('tab-deck');
  root.innerHTML = `
    <div class="deck-layout">
      <div class="deck-list-panel">
        <h3>我的卡組</h3>
        <div id="deck-list"></div>
        <div class="new-deck-form">
          <input id="new-deck-name" type="text" placeholder="新卡組名稱" />
          <select id="new-deck-format">
            ${Object.values(FORMATS).map((f) => `<option value="${f.id}">${f.label}</option>`).join('')}
          </select>
          <button id="new-deck-btn">＋ 新增空白卡組</button>
        </div>
        <div class="starter-import">
          <h4>從現行預組匯入</h4>
          <select id="starter-select">
            ${startersData.starters.map((s) => `<option value="${s.id}">${s.name}</option>`).join('')}
          </select>
          <button id="starter-import-btn">複製為我的卡組</button>
        </div>
      </div>
      <div class="deck-editor-panel">
        <div id="deck-editor"></div>
      </div>
    </div>
  `;

  const listEl = root.querySelector('#deck-list');
  const editorEl = root.querySelector('#deck-editor');

  function renderList() {
    listEl.innerHTML = '';
    for (const deck of deckStore.all()) {
      const item = document.createElement('div');
      item.className = 'deck-list-item' + (getEditingDeckId() === deck.id ? ' active' : '');
      const total = deck.main.reduce((s, e) => s + e.qty, 0);
      item.innerHTML = `<span>${deck.name}（${FORMATS[deck.format]?.label || deck.format}・${total}張）</span>`;
      item.onclick = () => {
        setEditingDeckId(deck.id);
        renderList();
        renderEditor();
        cardsUIRef.render();
      };
      const delBtn = document.createElement('button');
      delBtn.textContent = '刪除';
      delBtn.className = 'danger-small';
      delBtn.onclick = (e) => {
        e.stopPropagation();
        if (!confirm(`確定刪除「${deck.name}」？`)) return;
        deckStore.remove(deck.id);
        if (getEditingDeckId() === deck.id) setEditingDeckId(null);
        renderList();
        renderEditor();
        cardsUIRef.render();
      };
      item.appendChild(delBtn);
      listEl.appendChild(item);
    }
    if (deckStore.all().length === 0) listEl.innerHTML = '<p class="hint">尚未建立卡組。</p>';
  }

  function renderEditor() {
    const id = getEditingDeckId();
    if (!id) {
      editorEl.innerHTML = '<p class="hint">從左側選擇或建立一副卡組來編輯。</p>';
      return;
    }
    const deck = deckStore.get(id);
    if (!deck) {
      editorEl.innerHTML = '<p class="hint">找不到卡組。</p>';
      return;
    }
    const result = validateDeck(deck, db);
    const total = deck.main.reduce((s, e) => s + e.qty, 0);

    editorEl.innerHTML = `
      <div class="deck-editor-head">
        <input id="deck-name-input" type="text" value="${deck.name}" />
        <select id="deck-format-input">
          ${Object.values(FORMATS).map((f) => `<option value="${f.id}" ${f.id === deck.format ? 'selected' : ''}>${f.label}</option>`).join('')}
        </select>
      </div>
      <p class="deck-desc">${FORMATS[deck.format]?.desc || ''}</p>
      <div class="deck-status ${result.valid ? 'ok' : 'bad'}">
        ${result.valid ? `✅ 合法卡組（主卡組${total}張）` : `❌ 不合法（主卡組${total}張）`}
        ${result.errors.map((e) => `<div class="err">・${e}</div>`).join('')}
        ${result.warnings.map((w) => `<div class="warn">・${w}</div>`).join('')}
      </div>
      <div class="contract-slot">
        <strong>契約卡（不算入主卡組張數，開局直接進手牌）：</strong>
        ${deck.contractCardId
          ? (() => {
              try {
                const cc = db.getCard(deck.contractCardId);
                return `${cc.name}（${cc.id}） <button id="deck-clear-contract" class="danger-small">移除</button>`;
              } catch {
                return `未知卡片：${deck.contractCardId} <button id="deck-clear-contract" class="danger-small">移除</button>`;
              }
            })()
          : '（尚未指定，到「卡片資料庫」分頁找契約卡點「設為契約卡」）'}
      </div>
      <div class="deck-actions">
        <button id="deck-export-btn">複製卡表文字</button>
      </div>
      <div id="deck-card-list" class="deck-card-list"></div>
    `;

    root.querySelector('#deck-clear-contract')?.addEventListener('click', () => {
      deckStore.update(deck.id, { contractCardId: null });
      renderEditor();
      cardsUIRef.render();
    });

    root.querySelector('#deck-name-input').onchange = (e) => {
      deckStore.update(deck.id, { name: e.target.value });
      renderList();
    };
    root.querySelector('#deck-format-input').onchange = (e) => {
      deckStore.update(deck.id, { format: e.target.value });
      renderEditor();
      renderList();
    };
    root.querySelector('#deck-export-btn').onclick = () => {
      const lines = deck.main.map((e) => `${e.qty}x ${db.getCard(e.id).name}（${e.id}）`);
      const contractLine = deck.contractCardId ? `契約卡：${db.getCard(deck.contractCardId).name}（${deck.contractCardId}）` : '';
      const text = [`${deck.name}`, contractLine, ...lines].filter(Boolean).join('\n');
      navigator.clipboard?.writeText(text);
      alert('已複製卡表文字到剪貼簿（若瀏覽器阻擋剪貼簿權限，請手動複製下方內容）：\n\n' + text);
    };

    const listBox = root.querySelector('#deck-card-list');
    for (const entry of deck.main) {
      let card;
      try {
        card = db.getCard(entry.id);
      } catch {
        continue;
      }
      const row = document.createElement('div');
      row.className = 'deck-card-row';
      row.innerHTML = `
        <span class="dc-name">${card.name}</span>
        <span class="dc-meta">費${card.cost}${card.bp != null ? ` BP${card.bp}` : ''}</span>
        <span class="dc-qty">${entry.qty}</span>
      `;
      const minus = document.createElement('button');
      minus.textContent = '－';
      minus.onclick = () => {
        deckStore.addCard(deck.id, entry.id, -1);
        renderEditor();
        renderList();
        cardsUIRef.render();
      };
      const plus = document.createElement('button');
      plus.textContent = '＋';
      plus.onclick = () => {
        deckStore.addCard(deck.id, entry.id, 1);
        renderEditor();
        renderList();
        cardsUIRef.render();
      };
      row.appendChild(minus);
      row.appendChild(plus);
      listBox.appendChild(row);
    }
    if (deck.main.length === 0) listBox.innerHTML = '<p class="hint">卡組是空的，到「卡片資料庫」分頁把卡片加進來。</p>';
  }

  root.querySelector('#new-deck-btn').onclick = () => {
    const name = root.querySelector('#new-deck-name').value.trim() || '未命名卡組';
    const format = root.querySelector('#new-deck-format').value;
    const deck = deckStore.create(name, format);
    setEditingDeckId(deck.id);
    root.querySelector('#new-deck-name').value = '';
    renderList();
    renderEditor();
  };

  root.querySelector('#starter-import-btn').onclick = () => {
    const starterId = root.querySelector('#starter-select').value;
    const starter = startersData.starters.find((s) => s.id === starterId);
    const deck = deckStore.cloneFrom(starter, `${starter.name}（複製）`);
    setEditingDeckId(deck.id);
    renderList();
    renderEditor();
  };

  renderList();
  renderEditor();

  return { renderList, renderEditor };
}
