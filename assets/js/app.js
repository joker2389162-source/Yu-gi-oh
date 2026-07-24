/* 進入點 */
document.addEventListener("DOMContentLoaded", function () {
  UI.init();

  // 註冊 Service Worker（PWA：可加入主畫面、離線開啟介面）。
  // 需經 http(s) 或 localhost 提供；以 file:// 直接開啟時會靜默略過。
  if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
    // 若已有舊版 SW 在控制頁面，等新版接管後自動重載一次，確保看到最新版
    var hadController = !!navigator.serviceWorker.controller;
    var reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (hadController && !reloaded) { reloaded = true; window.location.reload(); }
    });
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").then(function (reg) {
        if (reg && reg.update) { try { reg.update(); } catch (e) {} }
      }).catch(function () { /* 忽略註冊失敗 */ });
    });
  }
});
