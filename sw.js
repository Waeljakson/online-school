const BUILD='20260925-1800';
self.addEventListener('install',event=>{
  self.skipWaiting();
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.map(k=>caches.delete(k)));
    // This legacy service worker is intentionally retired.
    // Do not navigate/reload open clients; the page handles version checks safely.
    await self.registration.unregister();
  })());
});
self.addEventListener('fetch',()=>{});
