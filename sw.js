/*
  sw.js — 서비스워커
  · 한 번 열어두면 그 다음부터는 인터넷이 없어도 앱이 그대로 열립니다.
  · 데이터(회원·대진·점수)는 원래부터 기기 안(localStorage)에 있으므로 여기서 다루지 않습니다.
  · 캐시 전략: 앱 파일은 캐시 우선(빠름), 없으면 네트워크에서 받아 캐시에 넣습니다.

  TODO: 새 버전 배포 시 CACHE 값을 올리면 이전 캐시가 정리됩니다.
        나중에 '새 버전이 있습니다 → 새로고침' 안내 UI를 붙일 자리입니다.
*/

const CACHE = 'tcm-v0.5.0';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest'])).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // 주소창으로 들어온 화면 요청: 캐시에 있는 index.html을 먼저 보여줍니다 (오프라인에서도 열림)
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});
