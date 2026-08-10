/**
 * Offline support for the hosted build.
 *
 * The shell is cached on install and served from the cache first, with a
 * background refresh, so the tool opens on a phone with no signal and picks up
 * a new version on the next visit with one. Nothing is computed on a server, so
 * there is nothing else to cache.
 *
 * The service worker globals are declared here rather than by switching the
 * whole project to the web worker library, which would take the DOM types away
 * from every other file.
 */

declare const __CACHE_VERSION__: string;

interface ExtendableEventLike {
  waitUntil(promise: Promise<unknown>): void;
}

interface FetchEventLike extends ExtendableEventLike {
  readonly request: Request;
  respondWith(response: Response | Promise<Response>): void;
}

interface ServiceWorkerScope {
  addEventListener(type: "install", listener: (event: ExtendableEventLike) => void): void;
  addEventListener(type: "activate", listener: (event: ExtendableEventLike) => void): void;
  addEventListener(type: "fetch", listener: (event: FetchEventLike) => void): void;
  skipWaiting(): Promise<void>;
  readonly clients: { claim(): Promise<void> };
}

const scope = globalThis as unknown as ServiceWorkerScope;

const CACHE_NAME = `kabucast-${__CACHE_VERSION__}`;
const SHELL = ["./", "./index.html", "./main.js", "./styles.css"];

scope.addEventListener("install", (event) => {
  event.waitUntil(
    (async (): Promise<void> => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(SHELL);
      await scope.skipWaiting();
    })(),
  );
});

scope.addEventListener("activate", (event) => {
  event.waitUntil(
    (async (): Promise<void> => {
      for (const name of await caches.keys()) {
        if (name !== CACHE_NAME) {
          await caches.delete(name);
        }
      }
      await scope.clients.claim();
    })(),
  );
});

scope.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    (async (): Promise<Response> => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      const network = fetch(request)
        .then(async (response) => {
          if (response.ok) {
            await cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => undefined);

      if (cached !== undefined) {
        return cached;
      }
      const fresh = await network;
      if (fresh !== undefined) {
        return fresh;
      }
      const fallback = await cache.match("./index.html");
      return fallback ?? new Response("offline", { status: 503 });
    })(),
  );
});
