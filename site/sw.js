/*
 * A service worker whose only job is to remove itself.
 *
 * Until the site got a landing page the app was served from /, and vite-plugin-pwa registered a
 * worker here at /sw.js with scope "/". That worker precached the app shell and answered every
 * navigation in its scope with it — so after the app moves to /app/, it would go on serving the
 * old app at the site root, and the landing page would never be seen by anybody who had visited
 * before. The page's own cleanup script cannot help: it never gets to run.
 *
 * The registration checks this URL for updates on navigation. Serving a stub that unregisters
 * itself is the standard way out, and it is why this file has to keep existing at exactly this
 * path rather than being deleted. Deleting it would also work eventually — a 404 makes browsers
 * drop the registration — but "eventually" there means at least one more stale page load.
 *
 * Caches are left alone deliberately. Cache storage is per-origin, not per-scope, so deleting
 * everything here would also throw away the precache that the app's own worker under /app/ just
 * built. Orphaned caches are evicted by the browser on its own schedule; a broken offline app is
 * not.
 */
self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    (async function () {
      await self.registration.unregister();
      // Reload whatever is open, so the tab that triggered this lands on the real page rather than
      // sitting on the cached app until somebody navigates again.
      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) client.navigate(client.url);
    })()
  );
});
