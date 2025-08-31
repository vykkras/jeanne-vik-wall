// Simple "app shell" cache + runtime cache for photos
const CACHE_NAME = "jvwall-v1";
const RUNTIME = "jvwall-runtime";

const APP_ASSETS = [
  "/",              // Vercel serves index.html at /
  "/index.html",
  "/manifest.webmanifest"
];

// Install: precache the shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_ASSETS))
  );
  self.skipWaiting();
});

// Activate: cleanup old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith("jvwall-") && k !== CACHE_NAME && k !== RUNTIME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: offline-first for navigations; cache-first for same-origin; SWR for photos
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Navigations -> serve cached index.html when offline
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/index.html")));
    return;
  }

  // Only GET requests benefit from caching
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Supabase public photos: stale-while-revalidate
  if (/supabase\.co\/storage\/v1\/object\/public\/photos\//.test(req.url)) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Same-origin assets -> cache-first
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(req).then((hit) =>
        hit ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME).then((c) => c.put(req, copy));
          return res;
        })
      )
    );
  }
});

async function staleWhileRevalidate(req) {
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(req);
  const network = fetch(req)
    .then((res) => {
      cache.put(req, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached || network;
}