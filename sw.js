/* Service Worker：App 殼層離線快取 + 卡圖執行時快取 */
const VERSION = "ygo-v7";
const SHELL = VERSION + "-shell";
const RUNTIME = VERSION + "-runtime";

// App 殼層（相對於 sw.js 所在範圍）
const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./assets/css/style.css",
  "./assets/js/s2t-data.js",
  "./assets/js/s2t.js",
  "./assets/js/data.js",
  "./assets/js/api.js",
  "./assets/js/deck.js",
  "./assets/js/collection.js",
  "./assets/js/builder.js",
  "./assets/js/ui.js",
  "./assets/js/app.js",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/favicon-32.png",
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(SHELL).then(function (c) { return c.addAll(SHELL_FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== SHELL && k !== RUNTIME) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  if (sameOrigin) {
    // App 殼層：network-first（線上永遠拿最新，離線才回退快取），避免更新後看到舊版
    e.respondWith(
      fetch(req).then(function (res) {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(SHELL).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) { return hit || caches.match("./index.html"); });
      })
    );
    return;
  }

  // 卡圖：runtime cache（stale-while-revalidate 風格）
  if (/images\.ygoprodeck\.com/.test(url.href)) {
    e.respondWith(
      caches.open(RUNTIME).then(function (cache) {
        return cache.match(req).then(function (hit) {
          const net = fetch(req).then(function (res) {
            if (res && res.status === 200) cache.put(req, res.clone());
            return res;
          }).catch(function () { return hit; });
          return hit || net;
        });
      })
    );
    return;
  }

  // API（ygocdb）：network-first，離線時回退快取
  if (/ygocdb\.com/.test(url.href)) {
    e.respondWith(
      fetch(req).then(function (res) {
        const copy = res.clone();
        caches.open(RUNTIME).then(function (c) { if (res.status === 200) c.put(req, copy); });
        return res;
      }).catch(function () { return caches.match(req); })
    );
    return;
  }
});
