const BUILD='20260924-1815';
self.addEventListener('install',event=>{
  self.skipWaiting();
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.map(k=>caches.delete(k)));
    await self.registration.unregister();
    const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of clients){
      try{
        const u=new URL(client.url);
        u.searchParams.set('roven_build',BUILD);
        await client.navigate(u.href);
      }catch{}
    }
  })());
});
self.addEventListener('fetch',()=>{});
