// GarmentVibes service worker.
//
// Deliberately conservative: this app's pages are personalised (cart badge,
// signed-in state) and the catalog will move to a live database, so caching
// HTML aggressively would serve stale or wrong-user content. Instead:
//   - static build assets + icons: cache-first (immutable, hashed filenames)
//   - navigations: network-first, falling back to a dedicated /offline page
//     only when the network is genuinely unavailable
//   - everything else: passthrough

const VERSION = "v1";
const STATIC_CACHE = `garmentvibes-static-${VERSION}`;
const OFFLINE_URL = "/offline";

const PRECACHE_URLS = [
  OFFLINE_URL,
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle same-origin GETs; never interfere with POSTs, auth flows, or
  // third-party requests (payment providers etc.).
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Immutable build output, icons and product art — cache-first is safe
  // because filenames are content-hashed (or the asset is stable).
  //
  // /placeholders/ matters more than it looks. Product images used to be
  // inlined into the HTML as data URIs, so they came along with any cached
  // page for free. Now that they are real files they are separate requests,
  // and without this a page served offline would render with every image
  // broken.
  const isStaticAsset =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/placeholders/");

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            return response;
          })
      )
    );
    return;
  }

  // Page navigations — always try the network first so users get live,
  // correctly-personalised content; only fall back to the offline page.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL).then((r) => r ?? Response.error()))
    );
  }
});
