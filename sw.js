// Traço offline: guarda o app no aparelho. Abre mesmo sem internet (a IA de narrar/foto é que precisa de rede).
const CACHE = 'traco-v1';
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    try {
      const r = await fetch('./', { cache: 'no-store' }); const html = await r.clone().text(); await c.put('./', r);
      const urls = [...html.matchAll(/(?:src|href)="([^"#:]+)"/g)].map((m) => m[1]).filter((u) => !u.startsWith('http'));
      const v = (html.match(/fea\.js\?(v=\d+)/) || [])[1];
      if (v) urls.push(`fea-worker.js?${v}`, `fea-nucleo.js?${v}`);
      await Promise.all(urls.map((u) => c.add(u).catch(() => {})));
    } catch { /* sem rede na instalação: guarda conforme for usando */ }
    self.skipWaiting();
  })());
});
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
async function limpa(c, r) { // apaga arquivos de versões antigas (outro ?v=)
  try { const v = ((await r.text()).match(/\?(v=\d+)/) || [])[1]; if (!v) return;
    for (const q of await c.keys()) if (/\?v=\d+/.test(q.url) && !q.url.includes(v)) await c.delete(q); } catch { /* */ }
}
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  const mesmo = url.origin === location.origin, fonte = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!mesmo && !fonte) return; // IA (Supabase) e outros sites: direto na rede
  if (req.mode === 'navigate') { // página: tenta a rede (3 s), senão usa a guardada
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      try {
        const r = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error('lento')), 3000))]);
        if (r.ok) { c.put('./', r.clone()); limpa(c, r.clone()); } return r;
      } catch { return (await c.match('./')) || (await c.match(req)) || Response.error(); }
    })());
    return;
  }
  e.respondWith((async () => { // arquivos (com ?v= da versão): o guardado primeiro, senão baixa e guarda
    const c = await caches.open(CACHE), hit = await c.match(req);
    if (hit) return hit;
    try { const r = await fetch(req); if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }
    catch { return (await c.match(req, { ignoreSearch: true })) || Response.error(); }
  })());
});
