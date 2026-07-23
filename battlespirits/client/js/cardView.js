import { COLOR_LABELS } from '../../shared/engine/rules.js';

const TYPE_LABELS = { spirit: '精靈', nexus: '據點', magic: '魔法', ultimate: '究極' };

export const KEYWORD_LABELS = {
  blocker: 'Blocker（攔截者）',
  doubleBlocker: 'Blocker×2（連續攔截）',
  flash: 'Flash（瞬間）',
  doubleAttack: 'Double Attack（雙倍傷害）',
  encore: 'Encore（回手牌）',
};

function keywordLabel(k) {
  return KEYWORD_LABELS[k] || k;
}

const ELEMENT_GRADIENTS = {
  white: 'linear-gradient(160deg,#f5f7fa,#c9d3e0)',
  red: 'linear-gradient(160deg,#ff8a65,#c62828)',
  yellow: 'linear-gradient(160deg,#ffe082,#f9a825)',
  blue: 'linear-gradient(160deg,#81d4fa,#1565c0)',
  green: 'linear-gradient(160deg,#a5d6a7,#2e7d32)',
  purple: 'linear-gradient(160deg,#ce93d8,#6a1b9a)',
};

const ELEMENT_SOLID = {
  white: '#c9d3e0',
  red: '#c62828',
  yellow: '#f9a825',
  blue: '#1565c0',
  green: '#2e7d32',
  purple: '#6a1b9a',
};

function placeholderGradient(card) {
  const colors = card.colors || [];
  if (colors.length === 0) return 'linear-gradient(160deg,#9aa5b4,#4a5568)';
  if (colors.length === 1) return ELEMENT_GRADIENTS[colors[0]] || 'linear-gradient(160deg,#9aa5b4,#4a5568)';
  const stops = colors.map((c) => ELEMENT_SOLID[c] || '#4a5568').join(', ');
  return `linear-gradient(135deg, ${stops})`;
}

// 卡圖：有 image 網址就顯示真圖，沒有就用依屬性色產生的佔位卡框（不是真的官方卡圖）。
export function cardArtHtml(card, { small } = {}) {
  if (card.image) {
    return `<img class="bs-card-art" src="${card.image}" alt="${card.name}" loading="lazy" />`;
  }
  const grad = placeholderGradient(card);
  const typeLabel = TYPE_LABELS[card.type] || card.type;
  return `<div class="bs-card-art bs-card-art--placeholder" style="background:${grad}">
    <span class="art-type">${typeLabel}</span>
    ${!small ? `<span class="art-name">${card.name}</span>` : ''}
  </div>`;
}

export function cardTitleLine(card) {
  const colors = (card.colors || []).map((c) => COLOR_LABELS[c] || c).join('/') || '無色';
  const bp = card.bp != null ? ` BP${card.bp}` : '';
  return `${card.name}（${TYPE_LABELS[card.type] || card.type}／${colors}／費${card.cost}${bp}）`;
}

export function renderCardCard(card, { onAdd, showQty, onAddContract } = {}) {
  const el = document.createElement('div');
  el.className = 'bs-card';
  if (card.collab) el.classList.add('bs-card--collab');
  if (card.awokenForm) el.classList.add('bs-card--awoken-form');
  el.innerHTML = `
    ${cardArtHtml(card)}
    <div class="bs-card-head">
      <span class="bs-card-name">${card.name}</span>
      <span class="bs-card-cost">${card.cost}</span>
    </div>
    <div class="bs-card-meta">
      ${TYPE_LABELS[card.type] || card.type} ・ ${(card.colors || []).map((c) => COLOR_LABELS[c] || c).join('/') || '無色'}
      ${card.bp != null ? ` ・ BP ${card.bp}` : ''}
      ${card.contractCard ? ' ・ <span class="tag tag--contract">契約卡（獨立欄位，不佔主卡組張數）</span>' : ''}
      ${card.collab ? ` ・ <span class="tag tag--collab">合作卡：${card.collabSeries || ''}</span>` : ''}
      ${card.awakening ? ' ・ <span class="tag tag--awaken">轉醒</span>' : ''}
      ${card.awokenForm ? ' ・ <span class="tag tag--awaken">轉醒後（不可直接入卡組）</span>' : ''}
      ${card.kourin ? ` ・ <span class="tag tag--kourin">煌臨：核心${card.kourin.cost}${card.kourin.targetFamily?.length ? '／' + card.kourin.targetFamily.join('・') + '系' : ''}</span>` : ''}
      ${card.ultimateSummon ? ` ・ <span class="tag tag--ultimate">究極：犧牲${card.ultimateSummon.sacrificeCount}張特殊召喚</span>` : ''}
    </div>
    <div class="bs-card-keywords">${(card.keywords || []).map(keywordLabel).join(' ／ ')}</div>
    <div class="bs-card-text">${card.text || ''}</div>
    <div class="bs-card-id">${card.id} ・ ${card.set}</div>
  `;
  if (card.awokenForm) {
    const note = document.createElement('p');
    note.className = 'hint-small';
    note.textContent = '此為轉醒後的背面卡，只能透過轉醒抵達，不能直接加入卡組。';
    el.appendChild(note);
  } else if (card.contractCard && onAddContract) {
    const btn = document.createElement('button');
    btn.className = 'bs-add-btn bs-add-btn--contract';
    btn.textContent = '設為契約卡';
    btn.onclick = () => onAddContract(card);
    el.appendChild(btn);
  } else if (onAdd) {
    const btn = document.createElement('button');
    btn.className = 'bs-add-btn';
    btn.textContent = showQty ? `＋ 加入（目前 ${showQty}）` : '＋ 加入卡組';
    btn.onclick = () => onAdd(card);
    el.appendChild(btn);
  }
  return el;
}
