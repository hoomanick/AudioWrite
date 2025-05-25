const CACHE_NAME = 'audiowrite-app-cache-v1';
const urlsToCache = [
  './', // Represents the current directory, good for root of deployment
  'index.html',
  'index.css',
  'index.tsx', 
  'manifest.json', // Add manifest for PWA
  'icons/icon-192x192.png', // Add PWA icons
  'icons/icon-512x512.png',
  'icons/apple-touch-icon.png', // Add a key apple icon
  // External assets that are critical for initial render/UI
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
  // Add other specific icon paths from index.html if desired for pre-caching
  // e.g., 'icons/apple-touch-icon-152x152.png', etc.
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        // Use addAll which will fail if any of the resources fail to cache.
        // For external resources, consider using cache.add individually with error handling
        // if some are non-critical.
        return cache.addAll(urlsToCache.map(url => new Request(url, { mode: 'cors' })))
          .catch(error => {
            console.error('Failed to cache one or more resources during install:', error);
            // Optionally, you could try to cache only essential files if some non-critical ones fail
          });
      })
  );
});

self.addEventListener('fetch', event => {
  // Let the browser handle requests for scripts from esm.sh (or other CDNs via importmap)
  if (event.request.url.startsWith('https://esm.sh')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        // Not in cache - fetch from network
        return fetch(event.request).then(
          networkResponse => {
            // Check if we received a valid response
            if(!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              // Don't cache opaque responses (e.g. no-cors) unless you mean to
              if (networkResponse.type === 'opaque') {
                 // console.log('Opaque response not cached:', event.request.url);
              } else {
                 // console.log('Fetch error, not caching:', event.request.url, networkResponse);
              }
              return networkResponse;
            }

            // IMPORTANT: Clone the response. A response is a stream
            // and because we want the browser to consume the response
            // as well as the cache consuming the response, we need
            // to clone it so we have two streams.
            const responseToCache = networkResponse.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                // We don't want to cache POST requests or other non-GET requests in this basic setup
                if (event.request.method === 'GET') {
                    cache.put(event.request, responseToCache);
                }
              });

            return networkResponse;
          }
        ).catch(error => {
          console.error('Fetch failed; returning offline page if available, or error:', error);
          // Optionally, return a generic offline page if the request is for navigation
          // if (event.request.mode === 'navigate') {
          //   return caches.match('/offline.html');
          // }
        });
      })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});