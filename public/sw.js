/* MePonto service worker — network-first with a tiny offline fallback. */
const CACHE = "meponto-v1";
const OFFLINE_URLS = ["/rider-app", "/icon-192.png", "/icon-512.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(OFFLINE_URLS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || !request.url.startsWith(self.location.origin)) return;
  // Never cache API responses.
  if (new URL(request.url).pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached ?? caches.match("/rider-app"))),
  );
});

/* Web Push: show HQ announcements even when the app is in the background. */
self.addEventListener("push", (event) => {
  let data = { title: "MePonto", body: "", url: "/rider-app" };
  try { data = { ...data, ...event.data.json() }; } catch (e) { if (event.data) data.body = event.data.text(); }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url },
      vibrate: [100, 50, 100],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/rider-app";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes("/rider-app") && "focus" in client) { client.navigate(url); return client.focus(); }
      }
      return clients.openWindow(url);
    }),
  );
});
