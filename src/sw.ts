/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision?: string | null }>;
};

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')));

// A newly activated release reloads open tabs once so they cannot keep old UI code.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) =>
      Promise.all(
        clients.map((client) =>
          'navigate' in client ? client.navigate(client.url).catch(() => null) : null
        )
      )
    )
  );
});
