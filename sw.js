/**
 * DeepSail Service Worker
 * Implements caching strategies for PWA offline support
 */

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `deepsail-static-${CACHE_VERSION}`;
const API_CACHE = `deepsail-api-${CACHE_VERSION}`;
const IMAGE_CACHE = `deepsail-images-${CACHE_VERSION}`;

// Static assets to pre-cache on install
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/route.html',
    '/weather.html',
    '/port.html',
    '/styles.css',
    '/js/common.js',
    '/manifest.json',
    '/offline.html'
];

// ─── Install: Pre-cache static assets ────────────────────────────────────────
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => cache.addAll(STATIC_ASSETS.filter(url => url !== '/offline.html')))
            .then(() => self.skipWaiting())
            .catch(err => console.warn('[SW] Pre-cache failed:', err))
    );
});

// ─── Activate: Clean old caches ───────────────────────────────────────────────
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then(cacheNames => Promise.all(
                cacheNames
                    .filter(name => {
                        return name.startsWith('deepsail-') &&
                            ![STATIC_CACHE, API_CACHE, IMAGE_CACHE].includes(name);
                    })
                    .map(name => caches.delete(name))
            ))
            .then(() => self.clients.claim())
    );
});

// ─── Fetch: Routing strategies ───────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') return;

    // Skip Chrome extensions
    if (url.protocol === 'chrome-extension:') return;

    // API requests: Network-first with cache fallback
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(networkFirstStrategy(request, API_CACHE, 300)); // 5 min cache
        return;
    }

    // Image requests: Cache-first with network fallback
    if (request.destination === 'image' || url.pathname.match(/\.(png|jpg|jpeg|gif|svg|webp)$/)) {
        event.respondWith(cacheFirstStrategy(request, IMAGE_CACHE));
        return;
    }

    // External map/CDN resources: Stale-while-revalidate
    if (url.hostname.includes('amap.com') ||
        url.hostname.includes('jsdelivr.net') ||
        url.hostname.includes('unpkg.com') ||
        url.hostname.includes('googleapis.com') ||
        url.hostname.includes('mapbox.com')) {
        event.respondWith(staleWhileRevalidateStrategy(request, STATIC_CACHE));
        return;
    }

    // HTML pages: Network-first with offline fallback
    if (request.destination === 'document') {
        event.respondWith(networkFirstWithOfflineFallback(request));
        return;
    }

    // Static assets: Cache-first
    event.respondWith(cacheFirstStrategy(request, STATIC_CACHE));
});

// ─── Caching Strategy Implementations ────────────────────────────────────────

/**
 * Network-first: Try network, fall back to cache.
 * Good for frequently-updated API data.
 */
async function networkFirstStrategy(request, cacheName, maxAgeSeconds = 600) {
    const cache = await caches.open(cacheName);
    try {
        const networkResponse = await fetch(request, { timeout: 8000 });
        if (networkResponse.ok) {
            const responseClone = networkResponse.clone();
            // Add timestamp header for cache expiry
            const headers = new Headers(responseClone.headers);
            headers.set('sw-cached-at', Date.now().toString());
            const cachedResponse = new Response(await responseClone.blob(), {
                status: responseClone.status,
                headers
            });
            cache.put(request, cachedResponse);
        }
        return networkResponse;
    } catch {
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
            const cachedAt = cachedResponse.headers.get('sw-cached-at');
            if (cachedAt && (Date.now() - parseInt(cachedAt)) < maxAgeSeconds * 1000) {
                return cachedResponse;
            }
        }
        return new Response(JSON.stringify({ error: '网络不可用，请检查网络连接' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

/**
 * Cache-first: Serve from cache, fall back to network.
 * Good for static assets that rarely change.
 */
async function cacheFirstStrategy(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    if (cachedResponse) return cachedResponse;

    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch {
        return new Response('Resource not available offline', { status: 503 });
    }
}

/**
 * Stale-while-revalidate: Serve from cache immediately, update in background.
 * Good for CDN resources and fonts.
 */
async function staleWhileRevalidateStrategy(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);

    const fetchPromise = fetch(request)
        .then(networkResponse => {
            if (networkResponse.ok) cache.put(request, networkResponse.clone());
            return networkResponse;
        })
        .catch(() => null);

    return cachedResponse || fetchPromise;
}

/**
 * Network-first with offline page fallback for HTML documents.
 */
async function networkFirstWithOfflineFallback(request) {
    const cache = await caches.open(STATIC_CACHE);
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch {
        const cachedResponse = await cache.match(request);
        if (cachedResponse) return cachedResponse;

        // Try to serve offline page
        const offlinePage = await cache.match('/offline.html');
        if (offlinePage) return offlinePage;

        return new Response('<h1>离线模式</h1><p>请检查您的网络连接</p>', {
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
    }
}

// ─── Background Sync for failed requests ─────────────────────────────────────
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-routes') {
        event.waitUntil(syncFailedRequests());
    }
});

async function syncFailedRequests() {
    // Implementation for syncing cached requests when back online
    console.log('[SW] Background sync triggered');
}

// ─── Push Notifications (future use) ─────────────────────────────────────────
self.addEventListener('push', (event) => {
    if (!event.data) return;
    const data = event.data.json();
    event.waitUntil(
        self.registration.showNotification(data.title || 'DeepSail', {
            body: data.body || '',
            icon: '/pictures/图片1.png',
            badge: '/pictures/图片1.png'
        })
    );
});
