/* 簡繁轉換器：
 *  S2T.disp(s) 簡→繁（台灣），用於所有卡片文字顯示
 *  S2T.query(s) 繁→簡，用於送出搜尋前正規化（ygocdb 卡庫以簡體收錄）
 * 字級對照（S2T_MAP / T2S_MAP 來自 OpenCC），離線、無外部依賴。
 */
const S2T = (function () {
  const s2t = (typeof S2T_MAP !== "undefined") ? S2T_MAP : {};
  const t2s = (typeof T2S_MAP !== "undefined") ? T2S_MAP : {};
  function map(str, table) {
    if (!str) return str;
    let out = "";
    for (const ch of str) out += table[ch] || ch;
    return out;
  }
  return {
    disp: function (s) { return map(s, s2t); },   // 顯示：簡→繁
    query: function (s) { return map(s, t2s); },  // 搜尋：繁→簡
  };
})();
