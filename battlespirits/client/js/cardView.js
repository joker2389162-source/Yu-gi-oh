import { COLOR_LABELS } from '../../shared/engine/rules.js';

const TYPE_LABELS = { spirit: 'Spirit', nexus: 'Nexus', magic: 'Magic', ultimate: 'Ultimate', brave: 'Brave' };

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

function placeholderArtHtml(card, small) {
  const grad = placeholderGradient(card);
  const typeLabel = TYPE_LABELS[card.type] || card.type;
  return `<div class="bs-card-art bs-card-art--placeholder" style="background:${grad}">
    <span class="art-type">${typeLabel}</span>
    ${!small ? `<span class="art-name">${card.name}</span>` : ''}
  </div>`;
}

// 官方圖片伺服器上少數卡片的圖檔實際上載不出來（連結失效／尚未上架等），單純顯示壞圖示對
// 使用者沒有意義，所以載入失敗時自動退回跟「沒有圖」時一樣的佔位卡框。
window.__bsCardArtFallback = function bsCardArtFallback(imgEl) {
  const card = {
    name: imgEl.dataset.cardName,
    type: imgEl.dataset.cardType,
    colors: imgEl.dataset.cardColors ? imgEl.dataset.cardColors.split(',').filter(Boolean) : [],
  };
  const small = imgEl.dataset.small === '1';
  imgEl.outerHTML = placeholderArtHtml(card, small);
};

// 卡圖：有 image 網址就顯示真圖，沒有就用依屬性色產生的佔位卡框（不是真的官方卡圖）。
export function cardArtHtml(card, { small } = {}) {
  if (card.image) {
    // 官方圖片伺服器會依 Referer 擋掉非官方網域的請求（防盜連結），
    // 不送 Referer 就能正常載入；少數卡片的圖檔本身在官方伺服器上就載不出來，
    // 這種情況用 onerror 退回佔位卡框，而不是顯示壞掉的圖示。
    return `<img class="bs-card-art" src="${card.image}" alt="${card.name}" loading="lazy" referrerpolicy="no-referrer"
      data-card-name="${card.name}" data-card-type="${card.type}" data-card-colors="${(card.colors || []).join(',')}"
      data-small="${small ? '1' : '0'}" onerror="window.__bsCardArtFallback(this)" />`;
  }
  return placeholderArtHtml(card, small);
}

const SUMMON_CONDITION_LABELS = {
  always: () => '',
  sacrifice: (c) => `召喚條件：犧牲自己場上${c.value}張卡片`,
  ownFieldBpAtLeast: (c) => `召喚條件：自己場上需有BP${c.value}以上的卡片`,
  lifeAtMost: (c) => `召喚條件：生命Core需在${c.value}個以下`,
};

function summonConditionTag(card) {
  if (!card.summonCondition || card.summonCondition.type === 'always') return '';
  const fn = SUMMON_CONDITION_LABELS[card.summonCondition.type];
  const label = fn ? fn(card.summonCondition) : `召喚條件：${card.summonCondition.type}`;
  return ` ・ <span class="tag tag--ultimate">${label}</span>`;
}

// 煌臨疊放對象的條件說明：優先用新格式的 condition.text，沒有的話退回舊格式
// 的 targetFamily 陣列（相容既有示範資料）。
function kourinConditionLabel(kourin) {
  if (kourin.condition?.text) return `／${kourin.condition.text}`;
  if (kourin.targetFamily?.length) return `／${kourin.targetFamily.join('・')}系`;
  return '';
}

export function cardTitleLine(card) {
  const colors = (card.colors || []).map((c) => COLOR_LABELS[c] || c).join('/') || '無色';
  const bp = card.bp != null ? ` BP${card.bp}` : '';
  return `${card.name}（${TYPE_LABELS[card.type] || card.type}／${colors}／費${card.cost}${bp}）`;
}

export function renderCardCard(card, { onAdd, showQty, onAddContract, isContractSelected } = {}) {
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
      ${card.contractCard ? ' ・ <span class="tag tag--contract">契約卡（算入主卡組40張，一副卡組只能收錄同一種）</span>' : ''}
      ${card.collab ? ` ・ <span class="tag tag--collab">合作卡：${card.collabSeries || ''}</span>` : ''}
      ${card.awakening ? ' ・ <span class="tag tag--awaken">轉醒</span>' : ''}
      ${card.awokenForm ? ' ・ <span class="tag tag--awaken">轉醒後（不可直接入卡組）</span>' : ''}
      ${card.kourin ? ` ・ <span class="tag tag--kourin">煌臨（消耗1點靈魂能量）${kourinConditionLabel(card.kourin)}</span>` : ''}
      ${summonConditionTag(card)}
      ${card.uTrigger ? ' ・ <span class="tag tag--ultimate">U觸發</span>' : ''}
    </div>
    <div class="bs-card-keywords">${(card.keywords || []).map(keywordLabel).join(' ／ ')}</div>
    <div class="bs-card-text">${card.textZh || card.text || ''}</div>
    <div class="bs-card-id">${card.id} ・ ${card.set}</div>
  `;
  if (card.awokenForm) {
    const note = document.createElement('p');
    note.className = 'hint-small';
    note.textContent = '此為轉醒後的背面卡，只能透過轉醒抵達，不能直接加入卡組。';
    el.appendChild(note);
  } else {
    if (onAdd) {
      const btn = document.createElement('button');
      btn.className = 'bs-add-btn';
      btn.textContent = showQty ? `＋ 加入（目前 ${showQty}）` : '＋ 加入卡組';
      btn.onclick = () => onAdd(card);
      el.appendChild(btn);
    }
    if (card.contractCard && onAddContract) {
      const btn = document.createElement('button');
      btn.className = 'bs-add-btn bs-add-btn--contract';
      btn.textContent = isContractSelected ? '✓ 已設為開局公開的契約卡' : '設為開局公開的契約卡';
      btn.disabled = !!isContractSelected;
      btn.onclick = () => onAddContract(card);
      el.appendChild(btn);
    }
  }
  return el;
}
