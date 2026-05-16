// Service Worker - network-first (オンラインなら常に最新)、オフライン時のみキャッシュ
const CACHE = 'shunkan-eisaku-v11';
// プリキャッシュ対象は最低限 (HTML/JS/CSS/JSON)。音声 mp3 は再生時に都度キャッシュされる。
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './data/index.json',
  './data/scenes/daily.json',
  './data/scenes/work.json',
  './data/scenes/travel.json',
  './data/scenes/restaurant.json',
  './data/scenes/trouble.json',
  './data/scenes/emotion.json',
  './data/scenes/reduction.json',
  './data/grammar.json',
  './data/dialogues.json',
  './data/reading.json',
  './data/vocab.json',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  // network-first: 常に最新を試みる、失敗時のみキャッシュへフォールバック
  e.respondWith(
    fetch(e.request).then(res => {
      const clone = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, clone));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
