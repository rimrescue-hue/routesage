const CACHE_NAME = "routesage-v1";
const STATIC_ASSETS = [
  "/",
  "/contacts",
  "/routes",
  "/reminders",
  "/manifest.json",
  "/pwa-icon-192.svg",
];

// Install: cache static assets
self.addEventListener("install", (event: any) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }),
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event: any) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
    }),
  );
  self.clients.claim();
});

// Fetch: serve from cache first, then network
self.addEventListener("fetch", (event: any) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          // Cache successful responses for same-origin requests
          if (
            response.status === 200 &&
            event.request.url.startsWith(self.location.origin) &&
            !event.request.url.includes("/api/")
          ) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(() => {
          // Offline fallback
          if (event.request.mode === "navigate") {
            return caches.match("/");
          }
          return new Response("Offline", { status: 503 });
        });
    }),
  );
});