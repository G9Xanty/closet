self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.clients.matchAll().then((clients) => {
        clients.forEach((client) => client.navigate(client.url));
      });
      await self.registration.unregister();
    })()
  );
});
