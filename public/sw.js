const CACHE = "closet-elander-v7";
const SHELL_CACHE = "closet-shell-v2";
const SHELL_ASSETS = [
  "/",
  "/offline.html",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
  "/assets/Press_Start_2P/PressStart2P-Regular.ttf",
  "/assets/vantablack%20computadora.png",
  "/assets/vantablack%20cell.png",
  "/assets/arcade_computadora.png",
  "/assets/ChatGPT%20Image%2029%20jun%202026%2C%2010_48_09.png"
];

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.allSettled(
        SHELL_ASSETS.map((url) =>
          cache.add(url).catch(() => {
            console.warn("[SW] Failed to cache:", url);
          })
        )
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== CACHE && key !== SHELL_CACHE)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok && request.method === "GET") {
      try {
        const cache = await caches.open(CACHE);
        await cache.put(request, response.clone());
      } catch (cacheError) {
        console.warn("[SW] Cache put failed:", cacheError.message);
      }
    }
    return response;
  } catch (error) {
    if (request.mode === "navigate") {
      const cached = await caches.match("/offline.html");
      if (cached) return cached;
    }
    return new Response(JSON.stringify({ error: "Offline" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function cacheFirst(request) {
  try {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response.ok && request.method === "GET") {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    if (request.mode === "navigate") {
      const cached = await caches.match("/offline.html");
      if (cached) return cached;
    }
    return new Response(JSON.stringify({ error: "Offline" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const request = event.request;

  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) {
    if (request.method === "GET") {
      event.respondWith(networkFirst(request));
    } else {
      event.respondWith(
        fetch(request).catch(() => {
          return new Response(JSON.stringify({ error: "Offline" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          });
        })
      );
    }
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});
