/* ============================================================
   i-DALIL — Service Worker (mod luar talian)
   Letakkan fail ini dalam folder yang SAMA dengan idalil-v3.html.

   - Halaman apps: "rangkaian dahulu" (sentiasa versi terkini bila ada
     internet), jatuh balik ke salinan tersimpan bila luar talian.
   - Fon (Amiri Quran dsb.): disimpan selepas dimuat kali pertama.
   - Google Apps Script / Sheets: TIDAK disentuh (sentiasa terus ke rangkaian).
   - Audio qari & pensyarah disimpan oleh halaman sendiri dalam cache
     'idalil-audio-v1' — service worker ini tidak memadamnya.
   ============================================================ */
const SHELL_CACHE = 'idalil-shell-v1';
const FONT_CACHE  = 'idalil-fonts-v1';
const KEEP = [SHELL_CACHE, FONT_CACHE, 'idalil-audio-v1'];
const SHELL = ['./idalil-v3.html', './manifest-idalil.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', event=>{
  event.waitUntil(
    caches.open(SHELL_CACHE).then(c=> Promise.all(
      SHELL.map(u=> c.add(new Request(u, {cache:'reload'})).catch(()=>{}))
    )).then(()=> self.skipWaiting())
  );
});

self.addEventListener('activate', event=>{
  event.waitUntil(
    caches.keys().then(keys=> Promise.all(
      keys.filter(k=> k.startsWith('idalil-') && !KEEP.includes(k)).map(k=> caches.delete(k))
    )).then(()=> self.clients.claim())
  );
});

async function networkFirst(req){
  const cache = await caches.open(SHELL_CACHE);
  const net = fetch(req).then(res=>{
    if(res && res.ok) cache.put(req, res.clone()).catch(()=>{});
    return res;
  });
  // talian lemah: jangan tunggu lebih 4 saat sebelum guna salinan tersimpan
  const quick = await Promise.race([
    net.catch(()=> null),
    new Promise(r=> setTimeout(()=> r('timeout'), 4000))
  ]);
  if(quick && quick !== 'timeout') return quick;
  const hit = await cache.match(req, {ignoreSearch:true})
           || (req.mode === 'navigate' ? await cache.match('./idalil-v3.html') : null);
  if(hit) return hit;
  try{ return await net; }
  catch(e){ return new Response('i-DALIL: tiada sambungan internet dan halaman belum disimpan.', {status:503, headers:{'Content-Type':'text/plain; charset=utf-8'}}); }
}

async function cacheFirst(req, cacheName){
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if(hit) return hit;
  const res = await fetch(req);
  if(res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()).catch(()=>{});
  return res;
}

self.addEventListener('fetch', event=>{
  const req = event.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);

  // backend Google — sentiasa terus ke rangkaian
  if(url.hostname.endsWith('script.google.com') || url.hostname.endsWith('googleusercontent.com')) return;

  // fon Google
  if(url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'){
    event.respondWith(cacheFirst(req, FONT_CACHE).catch(()=> fetch(req)));
    return;
  }

  // fail apps sendiri (dalam folder yang sama)
  if(url.origin === self.location.origin){
    if(url.pathname.includes('/__idalil_offline__/')) return; // kunci dalaman cache audio
    if(req.mode === 'navigate' || url.pathname.endsWith('.html')){
      event.respondWith(networkFirst(req));
    } else if(SHELL.some(s=> url.pathname.endsWith(s.replace('./','/')))){
      event.respondWith(networkFirst(req));
    }
  }
});
