/*
 * 資料層：現行環境（TCG/OCG 2025 下半 ~ 2026 上半知識）常見主題、流行構築骨架、
 * 以及卡組生成器所需的引擎與泛用卡池。
 *
 * 卡片以 { id, n, q } 表示：
 *   id = ygocdb 卡密（同時是 ygoprodeck 卡圖檔名），n = 中文卡名（顯示用備援），q = 張數。
 * 全部 id 皆已對照 ygocdb 中文卡庫驗證。卡片完整中文效果在點開時即時抓取。
 *
 * ⚠️ 環境會隨禁限與新卡變動。「流行構築」為代表性骨架範例，實際比賽請對照最新禁限表。
 * 每個主題都可用「查看系列全卡」即時載入資料庫中該系列的所有卡片，永遠是最新收錄。
 */

/* ---------- 泛用卡池（生成器 / 骨架共用） ---------- */

// 手坑（依汎用度排序）。budget: low=便宜 mid=中價 high=貴
const HANDTRAPS = [
  { id: 23434538, n: "增殖的G",            tier: "S", budget: "high", desc: "對方特召即抽卡，逼停展開的核心手坑" },
  { id: 14558127, n: "灰流丽",             tier: "S", budget: "high", desc: "無效檢索／特召／送墓，最泛用的手坑" },
  { id: 10045474, n: "无限泡影",           tier: "S", budget: "mid",  desc: "無效怪獸效果，後手翻盤主力陷阱" },
  { id: 27204311, n: "原始生命态 尼比鲁",  tier: "A", budget: "high", desc: "召喚 5 次後清場，剋連招最強泛用" },
  { id: 73642296, n: "屋敷童",             tier: "A", budget: "mid",  desc: "無效墓地效果，剋蛇眼、白森林等" },
  { id: 94145021, n: "小丑与锁鸟",         tier: "A", budget: "low",  desc: "封鎖檢索，剋一張起手的展開系" },
  { id: 59438930, n: "幽鬼兔",             tier: "B", budget: "low",  desc: "破壞特召／檢索的怪獸效果" },
  { id: 56099748, n: "维萨斯-斯塔弗罗斯特", tier: "B", budget: "mid",  desc: "可自我特召的調整手坑，兼展開素材" },
  { id: 94016752, n: "深渊的宣告者",       tier: "C", budget: "low",  desc: "宣言封鎖檢索卡名，特定對局用" },
];

// 破壞／拆場（泛用魔陷）
const BREAKERS = [
  { id: 25311006, n: "三战之才",           tier: "A", budget: "high", desc: "後手抽卡／奪控／無效，環境萬用單卡" },
  { id: 15693423, n: "颉颃胜负",           tier: "B", budget: "mid",  desc: "後手僅留 1 隻，強力清場陷阱" },
  { id: 18144506, n: "鹰身女妖的羽毛扫",   tier: "B", budget: "low",  desc: "破壞對方全部魔陷，剋擺場陷阱" },
];

// 泛用強力陷阱（供控制／陷阱風格卡組填充）。copies 為建議張數。
const GENERIC_TRAPS = [
  { id: 10045474, n: "无限泡影",           copies: 3, budget: "mid",  desc: "無效怪獸效果，最泛用手陷阱" },
  { id: 44095762, n: "神圣防护罩 -反射镜力-", copies: 2, budget: "low",  desc: "攻擊宣言時破壞對方全部攻擊表示怪獸" },
  { id: 69599136, n: "无底的落穴",         copies: 2, budget: "low",  desc: "召喚 1500 攻以上怪獸時除外" },
  { id: 83326048, n: "次元障壁",           copies: 2, budget: "mid",  desc: "封鎖對方一種召喚法，剋特召主題" },
  { id: 92512625, n: "神之忠告",           copies: 2, budget: "mid",  desc: "付 1500 LP 無效特召／效果並破壞" },
  { id: 40605147, n: "神之通告",           copies: 1, budget: "mid",  desc: "付 2000 LP 無效召喚／特召並破壞" },
  { id: 41420027, n: "神之宣告",           copies: 1, budget: "high", desc: "半數 LP 無效任何召喚／魔陷發動" },
];

// 泛用額外（連接／超量）—— 幾乎任何卡組都能放的萬用額外卡
const GENERIC_EXTRA = [
  { id: 29301450, n: "S：P小夜骑士",       desc: "2 星連接，除外妨害＋除外自解，泛用" },
  { id: 41999284, n: "连接栗子球",         desc: "1 星連接（Linkuriboh），解放調整、萬用連接素材" },
  { id: 4280258,  n: "召命之神弓-阿波罗萨", desc: "多素材連接，全體無效怪獸效果" },
  { id: 86066372, n: "访问码语者",         desc: "Link-4 打點終結者，連續破壞收尾" },
  { id: 98127546, n: "闭锁世界的冥神",     desc: "Link-5 大王，奪取對方怪獸壓場" },
  { id: 48815792, n: "灼热之火灵使 希塔",  desc: "炎屬性泛用連接，回收除外資源" },
];

// 經典主題「引擎補全」：有些主題的核心展開/搜尋卡與主題不同名（keyword 搜不到），
// 在此補上驗證過的引擎卡，讓生成的卡組能真正運作。可自行擴充更多主題。
const ENGINE_SUPPLEMENT = {
  "青眼": [
    { id: 8240199,  name: "青色眼睛的贤士", kind: "monster", typeLine: "[怪兽|效果|调整] 魔法师/光", level: 1, attrCN: "光", supQ: 3, role: "starter" },
    { id: 36734924, name: "青色眼睛的巫女", kind: "monster", typeLine: "[怪兽|效果|调整] 魔法师/光", level: 1, attrCN: "光", supQ: 1, role: "starter" },
    { id: 71039903, name: "太古的白石",     kind: "monster", typeLine: "[怪兽|效果|调整] 龙/光",     level: 1, attrCN: "光", supQ: 2, role: "starter" },
    { id: 79814787, name: "传说的白石",     kind: "monster", typeLine: "[怪兽|效果|调整] 龙/光",     level: 1, attrCN: "光", supQ: 1, role: "starter" },
    { id: 41620959, name: "龙之灵庙",       kind: "spell",   typeLine: "[魔法]",                     level: 0, supQ: 3, role: "starter" },
    { id: 73398797, name: "白龙之圣骑士",   kind: "monster", typeLine: "[怪兽|效果|仪式] 龙/光",     level: 4, attrCN: "光", supQ: 1, role: "starter" },
    { id: 89631139, name: "青眼白龙",       kind: "monster", typeLine: "[怪兽|通常] 龙/光",          level: 8, attrCN: "光", supQ: 3, role: "payoff" },
  ],
  // 黑魔術／黑魔導（Dark Magician）—— 怪獸名為「黑魔術師」、魔法名為「黑魔導X」，兩者不同名
  "黑魔": [
    { id: 7084129,  name: "魔术师之杖",   kind: "monster", typeLine: "[怪兽|效果] 魔法师/暗", level: 3, attrCN: "暗", supQ: 3, role: "starter" },
    { id: 97631303, name: "魔术师双魂",   kind: "monster", typeLine: "[怪兽|效果] 魔法师/暗", level: 1, attrCN: "暗", supQ: 1, role: "starter" },
    { id: 71696014, name: "魔术师之袍",   kind: "monster", typeLine: "[怪兽|效果] 魔法师/暗", level: 2, attrCN: "暗", supQ: 2, role: "starter" },
    { id: 47222536, name: "黑魔导阵",     kind: "spell",   typeLine: "[魔法|永续]",         level: 0, supQ: 3, role: "starter" },
    { id: 73616671, name: "幻像魔法",     kind: "spell",   typeLine: "[魔法|速攻]",         level: 0, supQ: 2, role: "starter" },
    { id: 46986414, name: "黑魔术师",     kind: "monster", typeLine: "[怪兽|通常] 魔法师/暗", level: 7, attrCN: "暗", supQ: 2, role: "payoff" },
  ],
  // 真紅眼（Red-Eyes）—— 旗艦「真紅眼黑龍」為通常怪，引擎卡（紅玉之寶札、傳說的黑石…）不同名
  "真红眼": [
    { id: 32566831, name: "红玉之宝札",   kind: "spell",   typeLine: "[魔法]",              level: 0, supQ: 3, role: "starter" },
    { id: 66574418, name: "传说的黑石",   kind: "monster", typeLine: "[怪兽|效果] 龙/暗",     level: 1, attrCN: "暗", supQ: 2, role: "starter" },
    { id: 36262024, name: "黑龙之雏",     kind: "monster", typeLine: "[怪兽|效果] 龙/暗",     level: 1, attrCN: "暗", supQ: 1, role: "starter" },
    { id: 93969023, name: "黑钢龙",       kind: "monster", typeLine: "[怪兽|效果] 龙/暗",     level: 1, attrCN: "暗", supQ: 1, role: "starter" },
    { id: 74677422, name: "真红眼黑龙",   kind: "monster", typeLine: "[怪兽|通常] 龙/暗",     level: 7, attrCN: "暗", supQ: 2, role: "payoff" },
  ],
  // 異色眼（Odd-Eyes，Arc-V 游矢）—— 引擎是不同名的「靈擺魔術師」群（調弦/慧眼/星讀…）
  "异色眼": [
    { id: 73941492, name: "调弦之魔术师", kind: "monster", typeLine: "[怪兽|效果|调整|灵摆] 魔法师/暗", level: 4, attrCN: "暗", supQ: 3, role: "starter" },
    { id: 72714461, name: "慧眼之魔术师", kind: "monster", typeLine: "[怪兽|效果|灵摆] 魔法师/光",     level: 4, attrCN: "光", supQ: 2, role: "starter" },
    { id: 94415058, name: "星读之魔术师", kind: "monster", typeLine: "[怪兽|效果|灵摆] 魔法师/暗",     level: 5, attrCN: "暗", supQ: 1, role: "starter" },
    { id: 20409757, name: "时读之魔术师", kind: "monster", typeLine: "[怪兽|效果|灵摆] 魔法师/暗",     level: 3, attrCN: "暗", supQ: 1, role: "starter" },
    { id: 48461764, name: "紫毒之魔术师", kind: "monster", typeLine: "[怪兽|效果|灵摆] 魔法师/暗",     level: 4, attrCN: "暗", supQ: 1, role: "starter" },
    { id: 17086528, name: "相生之魔术师", kind: "monster", typeLine: "[怪兽|效果|灵摆] 魔法师/光",     level: 4, attrCN: "光", supQ: 1, role: "starter" },
    { id: 71692913, name: "相克之魔术师", kind: "monster", typeLine: "[怪兽|效果|灵摆] 魔法师/暗",     level: 7, attrCN: "暗", supQ: 1, role: "starter" },
  ],
};
function supplementFor(keyword) {
  for (const k in ENGINE_SUPPLEMENT) {
    if (keyword.indexOf(k) >= 0 || k.indexOf(keyword) >= 0) return ENGINE_SUPPLEMENT[k];
  }
  return [];
}

// 依主屬性配對的泛用額外（靈使 Charmer 連接怪，每屬性一張，可 splash 進同屬性卡組）
const ATTR_EXTRA = {
  "炎": [{ id: 48815792, n: "灼热之火灵使 希塔" }],
  "地": [{ id: 97661969, n: "崔嵬之地灵使 奥丝" }],
  "水": [{ id: 73309655, n: "清冽之水灵使 艾莉娅" }],
  "风": [{ id: 30674956, n: "苍翠之风灵使 薇茵" }],
  "光": [{ id: 9839945,  n: "照耀之光灵使 莱娜" }],
  "暗": [{ id: 8264361,  n: "暗影之暗灵使 达克" }],
};

/* ---------- 生成器引擎（每個主題的核心包＋額外包） ---------- */

const ENGINES = {
  ryzeal: {
    name: "雷火沸動機（Ryzeal）", style: "combo",
    keywords: ["雷火沸动机"],
    core: [
      { id: 8633261,  n: "内燃雷火沸动机",  q: 3 },
      { id: 35844557, n: "剑式阴极雷火沸动机", q: 3 },
      { id: 72238166, n: "节式阳极雷火沸动机", q: 2 },
      { id: 34022970, n: "外燃雷火沸动机",  q: 1 },
      { id: 61116514, n: "掌式永磁雷火沸动机", q: 1 },
      { id: 60394026, n: "雷火沸动机插电",  q: 2 },
    ],
    extra: [
      { id: 60764609, n: "刻印群魔的刻魔锻冶师", q: 0 },
    ],
    recommend: { handtraps: 12, breakers: 4 },
  },
  snakeeye: {
    name: "蛇眼炎（Snake-Eye）", style: "combo",
    keywords: ["蛇眼"],
    core: [
      { id: 9674034,  n: "蛇眼梣树灵", q: 1 },
      { id: 45663742, n: "蛇眼橡树灵", q: 3 },
      { id: 90241276, n: "蛇眼炎磷",   q: 1 },
      { id: 48452496, n: "蛇眼炎龙",   q: 3 },
      { id: 53639887, n: "蛇眼神殿",   q: 1 },
      { id: 89023486, n: "原罪宝-蛇眼", q: 1 },
      { id: 24081957, n: "叛逆之罪宝-蛇眼", q: 1 },
      { id: 26700718, n: "蛇眼追赶剧", q: 1 },
    ],
    extra: [
      { id: 58071334, n: "蛇眼原罪龙", q: 1 },
      { id: 79415624, n: "蛇眼断罪龙", q: 1 },
    ],
    recommend: { handtraps: 11, breakers: 3 },
  },
  tenpai: {
    name: "天盃龍（Tenpai Dragon）", style: "aggro",
    keywords: ["天杯龙", "幻禄"],
    core: [
      { id: 91810826, n: "天杯龙 中龙",  q: 3 },
      { id: 39931513, n: "天杯龙 白龙",  q: 3 },
      { id: 65326118, n: "天杯龙 发龙",  q: 2 },
      { id: 23657016, n: "幻禄之天杯龙", q: 1 },
    ],
    extra: [],
    recommend: { handtraps: 12, breakers: 6 },
  },
  yubel: {
    name: "于貝爾（Yubel）", style: "control",
    keywords: ["于贝尔"],
    core: [
      { id: 78371393, n: "于贝尔",           q: 3 },
      { id: 4779091,  n: "于贝尔-被憎恶的骑士", q: 2 },
      { id: 31764700, n: "于贝尔-极度悲伤的魔龙", q: 1 },
      { id: 90829280, n: "于贝尔精灵",       q: 1 },
    ],
    extra: [
      { id: 47172959, n: "于贝尔-永远之爱的守护者", q: 1 },
      { id: 80453041, n: "于贝尔幻影",       q: 1 },
    ],
    recommend: { handtraps: 12, breakers: 4 },
  },
  whitewood: {
    name: "白森林（White Forest）", style: "combo",
    keywords: ["白森林"],
    core: [
      { id: 61980241, n: "白森林的莉泽特",   q: 3 },
      { id: 25592142, n: "白森林的阿斯忒瑞亚", q: 2 },
      { id: 98385955, n: "白森林的森厄维",   q: 1 },
      { id: 24779554, n: "白森林的濡血雅",   q: 1 },
      { id: 99289828, n: "白森林的传说",     q: 3 },
      { id: 35778533, n: "白森林禁止入内",   q: 2 },
    ],
    extra: [
      { id: 41924516, n: "白森林的魔狼 森厄狼", q: 1 },
      { id: 14307929, n: "白森林的妖魔 迪亚贝尔", q: 1 },
    ],
    recommend: { handtraps: 12, breakers: 3 },
  },
  fireking: {
    name: "炎王（Fire King）", style: "midrange",
    keywords: ["炎王"],
    core: [
      { id: 23015896, n: "炎王神兽 大鹏不死鸟", q: 2 },
      { id: 69000994, n: "炎王兽 巴隆",  q: 1 },
      { id: 96594609, n: "炎王兽 麒麟",  q: 1 },
      { id: 18621798, n: "炎王兽 甘尼许", q: 1 },
      { id: 22993208, n: "炎王的急袭",   q: 2 },
      { id: 59388357, n: "炎王炎环",     q: 3 },
      { id: 57554544, n: "炎王的孤岛",   q: 1 },
      { id: 91703676, n: "炎王神天烧",   q: 1 },
    ],
    extra: [
      { id: 66431519, n: "圣炎王 大鹏不死鸟", q: 1 },
    ],
    recommend: { handtraps: 12, breakers: 5 },
  },
  fiendsmith: {
    name: "刻魔／Fiendsmith 引擎", style: "engine",
    keywords: ["刻魔"],
    core: [
      { id: 60764609, n: "刻印群魔的刻魔锻冶师", q: 1 },
      { id: 98567237, n: "刻魔的咏圣", q: 3 },
      { id: 35552985, n: "刻魔的赞圣", q: 1 },
    ],
    extra: [
      { id: 2463794,  n: "刻魔的镇魂棺", q: 1 },
      { id: 49867899, n: "刻魔的大圣棺", q: 1 },
      { id: 32991300, n: "刻魔的神圣棺", q: 1 },
      { id: 46640168, n: "刻魔 落泪之日", q: 1 },
      { id: 82135803, n: "刻魔 震怒之日", q: 1 },
    ],
    recommend: { handtraps: 10, breakers: 3 },
  },
  centurion: {
    name: "百夫長（Centur-Ion）", style: "control",
    keywords: ["百夫长", "重骑士", "从骑士", "骑士皇"],
    core: [
      { id: 15005145, n: "重骑士 普莉梅拉", q: 3 },
      { id: 42493140, n: "从骑士 特露迪娅", q: 2 },
      { id: 18060565, n: "龙骑兵团-首席百夫长", q: 1 },
      { id: 78888899, n: "重骑兵 真理6", q: 1 },
      { id: 41371602, n: "起立吧百夫长骑士！", q: 3 },
    ],
    extra: [
      { id: 15982593, n: "骑士皇 雷加蒂娅", q: 1 },
    ],
    recommend: { handtraps: 12, breakers: 5 },
  },
  labrynth: {
    name: "拉比林斯（Labrynth）", style: "control",
    keywords: ["白银之城", "拉比林斯"],
    core: [
      { id: 75730490, n: "白银之城的召使 阿里亚娜", q: 3 },
      { id: 1225009,  n: "白银之城的召使 阿里安娜", q: 1 },
      { id: 2347656,  n: "白银之城的拉比林斯", q: 1 },
      { id: 48745395, n: "白银之城的魔神像", q: 1 },
      { id: 37629703, n: "白银之城的龙饰灯", q: 1 },
      { id: 74018812, n: "白银之城的火吹炉", q: 1 },
    ],
    extra: [],
    recommend: { handtraps: 6, breakers: 3 },
  },
  branded: {
    name: "烙印（Branded Despia）", style: "midrange",
    keywords: ["烙印"],
    core: [
      { id: 44362883, n: "烙印融合", q: 3 },
      { id: 36637374, n: "烙印开幕", q: 3 },
      { id: 34995106, n: "白之烙印", q: 1 },
      { id: 67100549, n: "烙印凶鸣", q: 1 },
      { id: 93595154, n: "烙印的裁决", q: 1 },
    ],
    extra: [
      { id: 87746184, n: "烙印龙 白界龙", q: 1 },
    ],
    recommend: { handtraps: 10, breakers: 3 },
  },
};

/* ---------- 流行構築（代表骨架） ---------- */
// staples 欄位會與 core 合併成主卡組；extra 為額外卡組。counts 僅為範例比例。

const META_DECKS = [
  {
    id: "ryzeal", name: "雷火沸動機（Ryzeal）", tier: "T1", styleLabel: "連招 / 超量",
    keywords: ["雷火沸动机"],
    blurb: "現行第一線的 Xyz 連招主題。單卡即可展開出多重妨害盤，後手靠「插電」與超量壓制翻盤，續戰力極強。常混入少量刻魔（Fiendsmith）引擎補強暗屬性連接。",
    core: ENGINES.ryzeal.core,
    engine: [
      { id: 60764609, n: "刻印群魔的刻魔锻冶师", q: 1 },
      { id: 98567237, n: "刻魔的咏圣", q: 2 },
    ],
    staples: [
      { id: 23434538, n: "增殖的G", q: 3 }, { id: 14558127, n: "灰流丽", q: 3 },
      { id: 10045474, n: "无限泡影", q: 3 }, { id: 94145021, n: "小丑与锁鸟", q: 2 },
      { id: 27204311, n: "原始生命态 尼比鲁", q: 1 }, { id: 25311006, n: "三战之才", q: 3 },
      { id: 15693423, n: "颉颃胜负", q: 1 },
    ],
    extra: [
      { id: 29301450, n: "S：P小夜骑士", q: 1 }, { id: 4280258, n: "召命之神弓-阿波罗萨", q: 1 },
      { id: 2463794, n: "刻魔的镇魂棺", q: 1 }, { id: 49867899, n: "刻魔的大圣棺", q: 1 },
      { id: 46640168, n: "刻魔 落泪之日", q: 1 },
    ],
  },
  {
    id: "snakeeye", name: "蛇眼炎（Snake-Eye）", tier: "T1", styleLabel: "連招 / 續戰",
    keywords: ["蛇眼"],
    blurb: "以蛇眼炎屬性循環搜尋與再利用著稱，一張起手就能鋪出多妨害並保留大量後續資源。對消耗戰極強，需注意屋敷童與尼比鲁的針對。",
    core: ENGINES.snakeeye.core,
    engine: [ { id: 85106525, n: "篝火", q: 3 } ],
    staples: [
      { id: 23434538, n: "增殖的G", q: 3 }, { id: 14558127, n: "灰流丽", q: 3 },
      { id: 10045474, n: "无限泡影", q: 3 }, { id: 73642296, n: "屋敷童", q: 2 },
      { id: 27204311, n: "原始生命态 尼比鲁", q: 1 }, { id: 25311006, n: "三战之才", q: 2 },
    ],
    extra: [
      { id: 58071334, n: "蛇眼原罪龙", q: 1 }, { id: 79415624, n: "蛇眼断罪龙", q: 1 },
      { id: 48815792, n: "灼热之火灵使 希塔", q: 1 }, { id: 29301450, n: "S：P小夜骑士", q: 1 },
      { id: 4280258, n: "召命之神弓-阿波罗萨", q: 1 },
    ],
  },
  {
    id: "tenpai", name: "天盃龍（Tenpai Dragon）", tier: "T1", styleLabel: "後手 OTK",
    keywords: ["天杯龙", "幻禄"],
    blurb: "極致的後手 OTK 主題。展開消耗極少、卡片全打在戰鬥階段，一回合連續攻擊直接打穿，因此能塞滿大量泛用手坑與破壞卡。剋制它的關鍵是戰鬥階段妨害與生命回復。",
    core: ENGINES.tenpai.core,
    engine: [],
    staples: [
      { id: 23434538, n: "增殖的G", q: 3 }, { id: 14558127, n: "灰流丽", q: 3 },
      { id: 10045474, n: "无限泡影", q: 3 }, { id: 73642296, n: "屋敷童", q: 3 },
      { id: 25311006, n: "三战之才", q: 3 }, { id: 15693423, n: "颉颃胜负", q: 3 },
      { id: 18144506, n: "鹰身女妖的羽毛扫", q: 1 }, { id: 27204311, n: "原始生命态 尼比鲁", q: 1 },
    ],
    extra: [],
  },
  {
    id: "yubel", name: "于貝爾（Yubel）", tier: "T2", styleLabel: "控制 / 中速",
    keywords: ["于贝尔"],
    blurb: "以傷害轉移與破壞免疫壓制的中速控制。用于貝爾家族循環自我特召，配合背信聖徒（阿薩米娜）與刻魔補強妨害，對純連招卡組耐性高。",
    core: ENGINES.yubel.core,
    engine: [
      { id: 60764609, n: "刻印群魔的刻魔锻冶师", q: 1 }, { id: 98567237, n: "刻魔的咏圣", q: 2 },
    ],
    staples: [
      { id: 23434538, n: "增殖的G", q: 3 }, { id: 14558127, n: "灰流丽", q: 3 },
      { id: 10045474, n: "无限泡影", q: 3 }, { id: 73642296, n: "屋敷童", q: 2 },
      { id: 25311006, n: "三战之才", q: 3 },
    ],
    extra: [
      { id: 47172959, n: "于贝尔-永远之爱的守护者", q: 1 }, { id: 80453041, n: "于贝尔幻影", q: 1 },
      { id: 2463794, n: "刻魔的镇魂棺", q: 1 }, { id: 29301450, n: "S：P小夜骑士", q: 1 },
    ],
  },
  {
    id: "whitewood", name: "白森林 × 阿薩米娜", tier: "T2", styleLabel: "連招 / 同調",
    keywords: ["白森林"],
    blurb: "以白森林調整族循環搭配同調與背信聖徒融合，兼具展開與魔陷破壞。棄牌即可觸發，抗手坑能力不錯，需管理牌組資源避免後繼無力。",
    core: ENGINES.whitewood.core,
    engine: [],
    staples: [
      { id: 23434538, n: "增殖的G", q: 3 }, { id: 14558127, n: "灰流丽", q: 3 },
      { id: 10045474, n: "无限泡影", q: 3 }, { id: 73642296, n: "屋敷童", q: 2 },
      { id: 25311006, n: "三战之才", q: 2 }, { id: 27204311, n: "原始生命态 尼比鲁", q: 1 },
    ],
    extra: [
      { id: 41924516, n: "白森林的魔狼 森厄狼", q: 1 }, { id: 14307929, n: "白森林的妖魔 迪亚贝尔", q: 1 },
      { id: 29301450, n: "S：P小夜骑士", q: 1 }, { id: 4280258, n: "召命之神弓-阿波罗萨", q: 1 },
    ],
  },
  {
    id: "fireking", name: "炎王（Fire King）", tier: "T2", styleLabel: "中速 / 破壞循環",
    keywords: ["炎王"],
    blurb: "以自我破壞回收循環維持續戰與破壞免疫，兼具展開彈性。可與蛇眼／炎屬性外掛結合，對長線消耗戰表現穩定。",
    core: ENGINES.fireking.core,
    engine: [ { id: 85106525, n: "篝火", q: 2 } ],
    staples: [
      { id: 23434538, n: "增殖的G", q: 3 }, { id: 14558127, n: "灰流丽", q: 3 },
      { id: 10045474, n: "无限泡影", q: 3 }, { id: 25311006, n: "三战之才", q: 2 },
      { id: 15693423, n: "颉颃胜负", q: 1 }, { id: 27204311, n: "原始生命态 尼比鲁", q: 1 },
    ],
    extra: [
      { id: 66431519, n: "圣炎王 大鹏不死鸟", q: 1 }, { id: 48815792, n: "灼热之火灵使 希塔", q: 1 },
      { id: 29301450, n: "S：P小夜骑士", q: 1 }, { id: 4280258, n: "召命之神弓-阿波罗萨", q: 1 },
    ],
  },
  {
    id: "centurion", name: "百夫長（Centur-Ion）", tier: "T2", styleLabel: "同調 / 控制",
    keywords: ["百夫长", "重骑士", "从骑士", "骑士皇"],
    blurb: "以永續陷阱般的百夫長怪獸自我特召循環，鋪出同調妨害並持續補牌的中速控制。展開消耗低、抗手坑，適合喜歡穩健壓場的玩家。",
    core: ENGINES.centurion.core,
    engine: [],
    staples: [
      { id: 23434538, n: "增殖的G", q: 3 }, { id: 14558127, n: "灰流丽", q: 3 },
      { id: 10045474, n: "无限泡影", q: 3 }, { id: 73642296, n: "屋敷童", q: 2 },
      { id: 25311006, n: "三战之才", q: 2 }, { id: 27204311, n: "原始生命态 尼比鲁", q: 1 },
    ],
    extra: [
      { id: 15982593, n: "骑士皇 雷加蒂娅", q: 1 }, { id: 29301450, n: "S：P小夜骑士", q: 1 },
      { id: 4280258, n: "召命之神弓-阿波罗萨", q: 1 },
    ],
  },
  {
    id: "labrynth", name: "拉比林斯（Labrynth）", tier: "T2", styleLabel: "陷阱控制",
    keywords: ["白银之城", "拉比林斯"],
    blurb: "以「白銀之城」惡魔搭配大量泛用通常陷阱的純控制卡組。用陷阱清場、以家具循環補充資源，對連招卡組耐性高；節奏慢但續戰穩定，需要熟練的陷阱運用。",
    core: ENGINES.labrynth.core,
    engine: [],
    staples: [
      { id: 10045474, n: "无限泡影", q: 3 }, { id: 15693423, n: "颉颃胜负", q: 2 },
      { id: 23434538, n: "增殖的G", q: 3 }, { id: 14558127, n: "灰流丽", q: 3 },
      { id: 25311006, n: "三战之才", q: 2 }, { id: 18144506, n: "鹰身女妖的羽毛扫", q: 1 },
    ],
    extra: [
      { id: 29301450, n: "S：P小夜骑士", q: 1 }, { id: 4280258, n: "召命之神弓-阿波罗萨", q: 1 },
    ],
  },
  {
    id: "branded", name: "烙印（Branded Despia）", tier: "T2", styleLabel: "融合 / 中速",
    keywords: ["烙印"],
    blurb: "以「烙印融合」一張起手鋪出多張融合大怪的中速卡組，兼具妨害與續戰。單卡爆發力高、後手也能靠融合翻盤，是長青的高泛用主題。",
    core: ENGINES.branded.core,
    engine: [],
    staples: [
      { id: 23434538, n: "增殖的G", q: 3 }, { id: 14558127, n: "灰流丽", q: 3 },
      { id: 10045474, n: "无限泡影", q: 3 }, { id: 25311006, n: "三战之才", q: 3 },
      { id: 27204311, n: "原始生命态 尼比鲁", q: 1 },
    ],
    extra: [
      { id: 87746184, n: "烙印龙 白界龙", q: 1 }, { id: 29301450, n: "S：P小夜骑士", q: 1 },
      { id: 4280258, n: "召命之神弓-阿波罗萨", q: 1 },
    ],
  },
];

/* 策略流派卡包（非單一系列，玩法導向）。以固定策展卡片為核心，生成器補足張數。
   卡片格式同 ENGINE_SUPPLEMENT；role: starter/interrupt/payoff/handtrap。 */
const STRATEGY_PRESETS = {
  // 燒血流：以效果傷害＋拖延取勝
  "烧血流": [
    { id: 3510565,  name: "隐形鸟",     kind: "monster", typeLine: "[怪兽|效果] 鸟兽/暗", level: 3, attrCN: "暗", supQ: 3, role: "interrupt" },
    { id: 83986578, name: "王虎",       kind: "monster", typeLine: "[怪兽|效果] 兽/地",   level: 4, attrCN: "地", supQ: 2, role: "interrupt" },
    { id: 51449743, name: "连锁爆破",   kind: "trap",  typeLine: "[陷阱]", level: 0, supQ: 3, role: "interrupt" },
    { id: 36468556, name: "停战协定",   kind: "trap",  typeLine: "[陷阱]", level: 0, supQ: 2, role: "interrupt" },
    { id: 72302403, name: "光之护封剑", kind: "spell", typeLine: "[魔法]", level: 0, supQ: 2, role: "interrupt" },
    { id: 33782437, name: "一时休战",   kind: "spell", typeLine: "[魔法]", level: 0, supQ: 2, role: "interrupt" },
  ],
  // 封鎖系：永續陷阱／場地展開封鎖
  "封锁系": [
    { id: 90846359, name: "群雄割据",   kind: "trap",  typeLine: "[陷阱|永续]", level: 0, supQ: 2, role: "interrupt" },
    { id: 53334471, name: "御前试合",   kind: "trap",  typeLine: "[陷阱|永续]", level: 0, supQ: 2, role: "interrupt" },
    { id: 5851097,  name: "虚无空间",   kind: "trap",  typeLine: "[陷阱|永续]", level: 0, supQ: 2, role: "interrupt" },
    { id: 82732705, name: "技能抽取",   kind: "trap",  typeLine: "[陷阱|永续]", level: 0, supQ: 2, role: "interrupt" },
    { id: 30241314, name: "大宇宙",     kind: "trap",  typeLine: "[陷阱|永续]", level: 0, supQ: 2, role: "interrupt" },
    { id: 93016201, name: "王宫的弹压", kind: "trap",  typeLine: "[陷阱|永续]", level: 0, supQ: 1, role: "interrupt" },
    { id: 61740673, name: "王宫的敕命", kind: "trap",  typeLine: "[陷阱|永续]", level: 0, supQ: 1, role: "interrupt" },
    { id: 83326048, name: "次元障壁",   kind: "trap",  typeLine: "[陷阱]",     level: 0, supQ: 2, role: "interrupt" },
    { id: 81674782, name: "次元的裂缝", kind: "spell", typeLine: "[魔法|永续]", level: 0, supQ: 2, role: "interrupt" },
  ],
  // 手牌破壞／擾亂：封鎖檢索、棄牌、剝奪對方資源
  "手牌破坏": [
    { id: 94145021, name: "小丑与锁鸟", kind: "monster", typeLine: "[怪兽|效果] 魔法师/风", level: 1, attrCN: "风", supQ: 3, role: "handtrap" },
    { id: 23434538, name: "增殖的G",    kind: "monster", typeLine: "[怪兽|效果] 昆虫/地", level: 2, attrCN: "地", supQ: 3, role: "handtrap" },
    { id: 14558127, name: "灰流丽",     kind: "monster", typeLine: "[怪兽|效果|调整] 不死/炎", level: 3, attrCN: "炎", supQ: 3, role: "handtrap" },
    { id: 25311006, name: "三战之才",   kind: "spell", typeLine: "[魔法]", level: 0, supQ: 3, role: "interrupt" },
    { id: 65681983, name: "抹杀之指名者", kind: "spell", typeLine: "[魔法|速攻]", level: 0, supQ: 2, role: "interrupt" },
    { id: 10045474, name: "无限泡影",   kind: "trap",  typeLine: "[陷阱]", level: 0, supQ: 3, role: "interrupt" },
  ],
  // 陰間阻抗：墓地／除外封鎖，剋墓地循環
  "阴间阻抗": [
    { id: 73642296, name: "屋敷童",     kind: "monster", typeLine: "[怪兽|效果|调整] 不死/地", level: 3, attrCN: "地", supQ: 3, role: "handtrap" },
    { id: 24508238, name: "D.D.乌鸦",  kind: "monster", typeLine: "[怪兽|效果] 鸟兽/暗", level: 1, attrCN: "暗", supQ: 2, role: "handtrap" },
    { id: 47355498, name: "王家长眠之谷", kind: "spell", typeLine: "[魔法|场地]", level: 0, supQ: 1, role: "interrupt" },
    { id: 81674782, name: "次元的裂缝", kind: "spell", typeLine: "[魔法|永续]", level: 0, supQ: 2, role: "interrupt" },
    { id: 30241314, name: "大宇宙",     kind: "trap",  typeLine: "[陷阱|永续]", level: 0, supQ: 2, role: "interrupt" },
    { id: 70342110, name: "次元幽闭",   kind: "trap",  typeLine: "[陷阱]", level: 0, supQ: 2, role: "interrupt" },
  ],
  // 報復社會：反制／拆場擾亂，專打對方成形盤
  "报复社会": [
    { id: 25311006, name: "三战之才",   kind: "spell", typeLine: "[魔法]", level: 0, supQ: 3, role: "interrupt" },
    { id: 15693423, name: "颉颃胜负",   kind: "trap",  typeLine: "[陷阱]", level: 0, supQ: 3, role: "interrupt" },
    { id: 18144506, name: "鹰身女妖的羽毛扫", kind: "spell", typeLine: "[魔法]", level: 0, supQ: 1, role: "interrupt" },
    { id: 83326048, name: "次元障壁",   kind: "trap",  typeLine: "[陷阱]", level: 0, supQ: 2, role: "interrupt" },
    { id: 27204311, name: "原始生命态 尼比鲁", kind: "monster", typeLine: "[怪兽|效果|调整] 岩石/光", level: 11, attrCN: "光", supQ: 2, role: "handtrap" },
    { id: 10045474, name: "无限泡影",   kind: "trap",  typeLine: "[陷阱]", level: 0, supQ: 3, role: "interrupt" },
  ],
};
function presetFor(keyword) {
  for (const k in STRATEGY_PRESETS) { if (keyword === k || keyword.indexOf(k) >= 0) return STRATEGY_PRESETS[k]; }
  return null;
}

/* 生成器「主題快選」——點一下即填入，也可直接輸入任何主題／卡名（不在列的照樣可用）。
   依世代分組，涵蓋原作到現在的代表系列，以及玩法導向的策略流派。 */
const QUICK_THEMES = [
  { group: "策略流派", items: [
    { label: "燒血流", kw: "烧血流" }, { label: "封鎖系", kw: "封锁系" },
    { label: "手牌破壞", kw: "手牌破坏" }, { label: "陰間阻抗", kw: "阴间阻抗" },
    { label: "報復社會", kw: "报复社会" },
  ]},
  { group: "現環境", items: [
    { label: "雷火沸動機", kw: "雷火沸动机" }, { label: "蛇眼", kw: "蛇眼" }, { label: "天盃龍", kw: "天杯龙" },
    { label: "于貝爾", kw: "于贝尔" }, { label: "白森林", kw: "白森林" }, { label: "刻魔", kw: "刻魔" },
    { label: "百夫長", kw: "百夫长" }, { label: "拉比林斯", kw: "白银之城" }, { label: "烙印", kw: "烙印" }, { label: "罪寶", kw: "罪宝" },
  ]},
  { group: "原作 / DM", items: [
    { label: "青眼白龍", kw: "青眼" }, { label: "黑魔導", kw: "黑魔术" }, { label: "真紅眼", kw: "真红眼" },
    { label: "栗子球", kw: "栗子球" }, { label: "古代機械", kw: "古代的机械" }, { label: "方界", kw: "方界" },
  ]},
  { group: "GX", items: [
    { label: "元素英雄", kw: "元素英雄" }, { label: "命運英雄", kw: "命运英雄" }, { label: "破壞王", kw: "破坏王" },
    { label: "寶玉獸", kw: "宝玉兽" }, { label: "究極寶玉神", kw: "究极宝玉神" }, { label: "武裝龍", kw: "武装龙" },
    { label: "水精鱗", kw: "水精鳞" }, { label: "甲蟲裝機", kw: "甲虫装机" }, { label: "水晶機巧", kw: "水晶机巧" },
  ]},
  { group: "5D's", items: [
    { label: "六武眾", kw: "六武众" }, { label: "黑羽", kw: "黑羽" }, { label: "科技屬", kw: "科技属" },
    { label: "星塵", kw: "星尘" }, { label: "紅蓮", kw: "红莲" }, { label: "地縛神", kw: "地缚神" },
    { label: "森羅", kw: "森罗" }, { label: "魔轟神", kw: "魔轰神" }, { label: "秘旋", kw: "秘旋" },
  ]},
  { group: "ZEXAL", items: [
    { label: "希望", kw: "希望" }, { label: "冰結界", kw: "冰结界" }, { label: "忍者", kw: "忍者" },
    { label: "武神", kw: "武神" }, { label: "炎星", kw: "炎星" }, { label: "彼岸", kw: "彼岸" },
    { label: "影靈衣", kw: "影灵衣" }, { label: "征龍", kw: "征龙" }, { label: "魔導書", kw: "魔导书" },
    { label: "機皇", kw: "机皇" }, { label: "代行者", kw: "代行者" },
  ]},
  { group: "ARC-V", items: [
    { label: "異色眼", kw: "异色眼" }, { label: "靈擺魔術師", kw: "魔术师" }, { label: "娛樂夥伴", kw: "娱乐伙伴" },
    { label: "霸王", kw: "霸王" }, { label: "DD", kw: "DD" }, { label: "幻奏", kw: "幻奏" }, { label: "相劍", kw: "相剑" },
  ]},
  { group: "VRAINS / 現代", items: [
    { label: "碼語者", kw: "码语者" }, { label: "閃刀姬", kw: "闪刀姬" }, { label: "轉生炎獸", kw: "转生炎兽" },
    { label: "電子界", kw: "电子界" }, { label: "召喚獸", kw: "召唤兽" }, { label: "魔彈", kw: "魔弹" },
    { label: "電子龍", kw: "电子龙" }, { label: "劍鬥獸", kw: "剑斗兽" }, { label: "龍女僕", kw: "龙女仆" },
    { label: "幻影騎士團", kw: "幻影骑士团" }, { label: "捕食植物", kw: "捕食植物" },
  ]},
];
