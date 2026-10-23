// Offline cache for the game shell.
const CACHE = 'clashclaude-v1';
const FILES = [
  './', 'index.html', 'css/style.css', 'manifest.json', 'icon.svg',
  'js/data.js', 'js/sound.js', 'js/village.js', 'js/render.js', 'js/battle.js', 'js/clan.js', 'js/ui.js', 'js/main.js',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// network first so updates show up, cache as fallback when offline
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok && new URL(e.request.url).origin === location.origin) {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return r;
    }).catch(() => caches.match(e.request))
  );
});
