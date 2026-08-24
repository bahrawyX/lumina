// Lumina Service Worker — push notifications + offline support
// Version is bumped to trigger update when deploying changes
const CACHE_VERSION = 'lumina-v1';
const OFFLINE_URL = '/offline.html';

// ── Install ─────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      cache.addAll([
        OFFLINE_URL,
        '/icons/pwa-192.png',
        '/icons/pwa-512.png',
        '/icons/badge-72.png',
      ])
    )
  );
  // Activate immediately
  self.skipWaiting();
});

// ── Activate ────────────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  // Claim all open tabs immediately
  self.clients.claim();
});

// ── Fetch — offline fallback for navigation requests ────────────────────────

self.addEventListener('fetch', (event) => {
  // Only handle navigation (page) requests
  if (event.request.mode !== 'navigate') return;

  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(OFFLINE_URL).then((cached) => cached || new Response('Offline', { status: 503 }))
    )
  );
});

// ── Push Notifications ──────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    return;
  }

  const options = {
    body: data.body,
    icon: '/icons/pwa-192.png',
    badge: '/icons/badge-72.png',
    tag: data.tag || 'lumina-notification',
    renotify: data.renotify || false,
    requireInteraction: data.requireInteraction || false,
    silent: false,
    data: {
      url: data.url || '/',
      notificationType: data.notificationType,
    },
    actions: data.actions || [],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

function isSameOrigin(candidate) {
  try {
    return new URL(candidate).origin === self.location.origin;
  } catch (_) {
    return false;
  }
}

// ── Notification Click ──────────────────────────────────────────────────────

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // P1-14: `data.url` was passed straight to `client.navigate()` and
  // `openWindow()` with NO scheme or origin check. Not exploitable while
  // /api/push/send only reaches the caller's own subscriptions, but it turns
  // any future payload influence into a one-click redirect out of the PWA.
  //
  // Resolving against our own origin and then comparing origins rejects
  // absolute URLs, protocol-relative `//evil.com`, and `javascript:` alike.
  let url = '/';
  try {
    const parsed = new URL(event.notification.data?.url || '/', self.location.origin);
    if (parsed.origin === self.location.origin) url = parsed.href;
  } catch (_) {
    // Malformed — fall back to the app root.
  }
  const action = event.action;

  // Handle action buttons
  if (action === 'start_focus') {
    event.waitUntil(self.clients.openWindow('/focus'));
    return;
  }
  if (action === 'view_plan') {
    event.waitUntil(self.clients.openWindow('/plan'));
    return;
  }
  if (action === 'dismiss') return;

  // Default: open/focus the app at the target URL
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Try to focus an existing window
      for (const client of clientList) {
        // `.includes()` is a SUBSTRING match, not a prefix match, so
        // `https://evil.com/?x=https://lumina.app` would have satisfied it.
        // It also tested the EXISTING client's URL rather than the target.
        if (isSameOrigin(client.url) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // No existing window — open a new one
      return self.clients.openWindow(url);
    })
  );
});
