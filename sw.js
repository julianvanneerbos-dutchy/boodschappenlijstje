const CACHE_VERSION = "boodschappen-v2";
const APP_CACHE = CACHE_VERSION;

// Bestanden die essentieel zijn om de app offline te kunnen openen.
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./products.json",
  "./icon-192.png",
  "./icon-512.png"
];

// INSTALL
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ACTIVATE
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== APP_CACHE)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

// FETCH
self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Alleen GET-verzoeken kunnen we cachen.
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  // Navigatie naar de app:
  // eerst proberen de nieuwste versie van internet te halen.
  // Bij geen internet gebruiken we de offline versie.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();

          caches.open(APP_CACHE).then((cache) => {
            cache.put("./index.html", copy);
          });

          return response;
        })
        .catch(() => caches.match("./index.html"))
    );

    return;
  }

  // Eigen bestanden: cache-first.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();

            caches.open(APP_CACHE).then((cache) => {
              cache.put(request, copy);
            });
          }

          return response;
        });
      })
    );

    return;
  }

  // Externe bestanden, zoals Firebase:
  // netwerk proberen en daarna lokaal bewaren.
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const networkRequest = fetch(request)
        .then((response) => {
          // Alleen bruikbare responses cachen.
          if (response.ok || response.type === "opaque") {
            const copy = response.clone();

            caches.open(APP_CACHE).then((cache) => {
              cache.put(request, copy);
            });
          }

          return response;
        })
        .catch(() => cachedResponse);

      return cachedResponse || networkRequest;
    })
  );
});
