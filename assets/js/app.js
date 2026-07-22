/* 進入點 */
document.addEventListener("DOMContentLoaded", function () {
  UI.init();

  // 註冊 Service Worker（PWA：可加入主畫面、離線開啟介面）。
  // 需經 http(s) 或 localhost 提供；以 file:// 直接開啟時會靜默略過。
  if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () { /* 忽略註冊失敗 */ });
    });
  }
});
