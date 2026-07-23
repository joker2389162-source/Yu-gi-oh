// 基本規則常數。數值依公開規則摘要整理（無法直接存取官方規則手冊原文校對），
// 若與最新官方規則手冊有出入，之後只要改這裡的數字即可，不用動引擎邏輯。
export const RULES = {
  startingLifeCores: 5,
  startingReserveCores: 3,
  startingSoulCores: 1, // 額外附加於儲備區的靈魂核心
  startingHandSize: 4,
  drawPerTurn: 1,
  burstSetsPerTurn: 1, // 每回合可無償覆蓋放置的爆發卡數量上限
};

export const COLORS = ['white', 'red', 'yellow', 'blue', 'green', 'purple'];

export const COLOR_LABELS = {
  white: '白', red: '赤', yellow: '黃', blue: '藍', green: '綠', purple: '紫',
};

export const TURN_STEPS = [
  'start', // 開始步驟：回合開始時效果觸發
  'core', // 核心步驟：可從儲備區移動1個核心到場上卡片
  'draw', // 抽牌步驟：抽1張牌
  'refresh', // 復甦步驟：棄核區核心全數移回儲備區
  'main', // 主要步驟：召喚／使用魔法／設置爆發卡
  'attack', // 攻擊步驟：宣告攻擊、攔截、傷害結算
  'main2', // 第二主要步驟
  'end', // 結束步驟
];

export const STEP_LABELS = {
  start: '開始步驟', core: '核心步驟', draw: '抽牌步驟', refresh: '復甦步驟',
  main: '主要步驟', attack: '攻擊步驟', main2: '第二主要步驟', end: '結束步驟',
};
