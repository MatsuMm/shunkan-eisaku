// Service Worker - network-first (オンラインなら常に最新)、オフライン時のみキャッシュ
const CACHE = 'shunkan-eisaku-v24';
// プリキャッシュ対象 (HTML/JS/CSS/JSON/icons/legal)。音声 mp3 は再生時に都度キャッシュされる。
const ASSETS = [
  // shell
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './START_HERE.md',
  // icons
  './icons/icon-192.png',
  './icons/icon-512.png',
  // legal
  './legal/terms.html',
  './legal/privacy.html',
  './legal/start-here.html',
  // data
  './data/index.json',
  './data/grammar.json',
  './data/dialogues.json',
  './data/reading.json',
  // scenes
  './data/scenes/daily.json',
  './data/scenes/work.json',
  './data/scenes/it-support.json',
  './data/scenes/travel.json',
  './data/scenes/restaurant.json',
  './data/scenes/trouble.json',
  './data/scenes/emotion.json',
  './data/scenes/reduction.json',
  // levels
  './data/levels/lv1.json',
  './data/levels/lv2.json',
  './data/levels/lv3.json',
  './data/levels/lv4.json',
  './data/levels/lv5.json',
  './data/levels/lv1-work.json',
  './data/levels/lv1-travel.json',
  './data/levels/lv1-restaurant.json',
  './data/levels/lv2-work.json',
  './data/levels/lv2-travel.json',
  './data/levels/lv2-restaurant.json',
  './data/levels/lv4-work.json',
  './data/levels/lv4-travel.json',
  './data/levels/lv4-restaurant.json',
  './data/levels/lv5-work.json',
  './data/levels/lv5-travel.json',
  './data/levels/lv5-restaurant.json',
];

self.addEventListener('install', e => {
  // 1 asset の 404 で install 全体を落とさない
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.allSettled(ASSETS.map(url => c.add(url).catch(() => undefined)))
    )
  );
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
