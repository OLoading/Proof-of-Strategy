// ==================================================
// PROOF OF STRATEGY — Service Worker (Patch 1.1)
// Cache-first do app shell para jogar offline + instalável (PWA)
// ==================================================
const CACHE = "pos-cache-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./config.js",
  "./upgrades.js",
  "./save.js",
  "./game.js",
  "./icon.svg",
  "./manifest.webmanifest",
  "./sounds/click.mp3",
  "./sounds/block.mp3",
  "./sounds/buy.mp3",
  "./sounds/event.mp3",
  "./sounds/error.mp3",
  "./sounds/ambient.mp3"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => {})
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          // atualiza o cache em segundo plano (somente respostas válidas same-origin)
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
