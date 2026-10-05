const CACHE_NAME = "boodschappen-v5";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./products.json",
  "./changelog.json"
];

// Direct activeren bij nieuwe code
self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
});

// Oude caches direct opruimen en controle overnemen
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

// Network-first strategie: altijd direct de nieuwste GitHub versie ophalen
self.addEventListener("fetch", (e) => {
  // Laat Firestore / Google API verkeer direct over het netwerk gaan
  if (!e.request.url.startsWith("http")) return;
  if (e.request.url.includes("firestore.googleapis.com") || e.request.url.includes("identitytoolkit")) {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === "basic") {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => caches.match(e.request))
  );
});
