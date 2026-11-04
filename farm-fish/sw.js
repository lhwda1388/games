// Pixel Pastoral service worker (built from farm-fish/pwa/sw.js; build.js fills in the version).
// Never traps a player on an old build: the page is network-first (the cache is only the offline fallback),
// only the icons and the manifest are cache-first, and every build gets a new cache name.
// Scope is this folder only: requests outside it are left alone and never cached. The origin is shared
// with other games, so only our own 'farmfish-' caches are ever deleted.
'use strict';
var SW_VERSION = 'bfb78eb0b38c';
var SW_PREFIX = 'farmfish-';
var SW_CACHE = SW_PREFIX + SW_VERSION;
var SW_SCOPE = (self.registration && self.registration.scope) || new URL('./', self.location.href).href;
var SW_STATIC = ['manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];

function swStaticUrls() { return SW_STATIC.map(function (f) { return new URL(f, SW_SCOPE).href; }); }
function swPage(url) {   // the game page itself: the folder, or index.html in it (any ?query)
  var u = new URL(url), base = new URL(SW_SCOPE);
  return u.origin === base.origin && (u.pathname === base.pathname || u.pathname === base.pathname + 'index.html');
}

function swInstall() {
  return caches.open(SW_CACHE).then(function (c) {
    // one by one and forgiving: a missing icon must not stop the page from working offline
    return Promise.all([SW_SCOPE].concat(swStaticUrls()).map(function (u) {
      return fetch(u, { cache: 'no-cache' }).then(function (r) { if (r.ok) return c.put(u, r); }).catch(function () {});
    }));
  });
}
// write into our cache only while it still exists: an old worker finishing a fetch after the new one activated
// must not bring its deleted cache back
function swKeep(url, r) {
  return caches.has(SW_CACHE).then(function (yes) { if (yes) return caches.open(SW_CACHE).then(function (c) { return c.put(url, r); }); });
}
function swActivate() {
  return caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf(SW_PREFIX) === 0 && k !== SW_CACHE; })
      .map(function (k) { return caches.delete(k); }));
  });
}

// the Response promise for a request, or null to let the browser handle it untouched
function swRespond(req) {
  if (req.method !== 'GET' || req.url.indexOf(SW_SCOPE) !== 0) return null;
  if (req.mode === 'navigate' || swPage(req.url)) {
    // network-first, revalidating past the HTTP cache; offline → the last page we saw
    return fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(function (r) {
      if (r.ok && swPage(req.url)) swKeep(SW_SCOPE, r.clone()).catch(function () {});   // only the game page is the offline page
      return r;
    }).catch(function (err) {
      return caches.match(SW_SCOPE).then(function (hit) {   // match, not open: reading never creates a cache
        if (hit) return hit;
        throw err;
      });
    });
  }
  if (swStaticUrls().indexOf(req.url.split('?')[0]) !== -1) {
    return caches.match(req.url, { cacheName: SW_CACHE }).then(function (hit) {
      return hit || fetch(req).then(function (r) { if (r.ok) swKeep(req.url, r.clone()).catch(function () {}); return r; });
    });
  }
  return null;
}

// tell our open pages which build this worker is: a page from another build shows 「새 버전이 있어요」, the same build stays quiet
function swAnnounce() {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
    cs.forEach(function (c) { if (String(c.url).indexOf(SW_SCOPE) === 0) c.postMessage({ farmfish: 'build', id: SW_VERSION }); });
  });
}

self.addEventListener('install', function (e) { e.waitUntil(swInstall().then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) {
  e.waitUntil(swActivate().then(function () { return self.clients.claim(); }).then(swAnnounce).catch(function () {}));
});
self.addEventListener('fetch', function (e) { var p = swRespond(e.request); if (p) e.respondWith(p); });
