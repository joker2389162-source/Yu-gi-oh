import { COLOR_LABELS } from '../../shared/engine/rules.js';

const TYPE_LABELS = { spirit: '精靈', nexus: '據點', magic: '魔法' };

export function cardTitleLine(card) {
  const colors = (card.colors || []).map((c) => COLOR_LABELS[c] || c).join('/') || '無色';
  const bp = card.bp != null ? ` BP${card.bp}` : '';
  return `${card.name}（${TYPE_LABELS[card.type] || card.type}／${colors}／費${card.cost}${bp}）`;
}

export function renderCardCard(card, { onAdd, showQty } = {}) {
  const el = document.createElement('div');
  el.className = 'bs-card';
  if (card.collab) el.classList.add('bs-card--collab');
  el.innerHTML = `
    <div class="bs-card-head">
      <span class="bs-card-name">${card.name}</span>
      <span class="bs-card-cost">${card.cost}</span>
    </div>
    <div class="bs-card-meta">
      ${TYPE_LABELS[card.type] || card.type} ・ ${(card.colors || []).map((c) => COLOR_LABELS[c] || c).join('/') || '無色'}
      ${card.bp != null ? ` ・ BP ${card.bp}` : ''}
      ${card.contractCard ? ' ・ <span class="tag tag--contract">契約卡</span>' : ''}
      ${card.collab ? ` ・ <span class="tag tag--collab">合作卡：${card.collabSeries || ''}</span>` : ''}
    </div>
    <div class="bs-card-keywords">${(card.keywords || []).join(' / ')}</div>
    <div class="bs-card-text">${card.text || ''}</div>
    <div class="bs-card-id">${card.id} ・ ${card.set}</div>
  `;
  if (onAdd) {
    const btn = document.createElement('button');
    btn.className = 'bs-add-btn';
    btn.textContent = showQty ? `＋ 加入（目前 ${showQty}）` : '＋ 加入卡組';
    btn.onclick = () => onAdd(card);
    el.appendChild(btn);
  }
  return el;
}
