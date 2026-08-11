/**
 * Offline support for the hosted build.
 *
 * The page itself is fetched from the network first and falls back to the
 * cache, so a deployment is picked up on the next load rather than the one
 * after it. The script and the stylesheet carry a content hash in their names,
 * which makes them immutable: a given URL can only ever mean one file, so they
 * are served from the cache without asking, and a fresh page can never be
 * paired with a stale script.
 *
 * The service worker globals are declared here rather than by switching the
 * whole project to the web worker library, which would take the DOM types away
 * from every other file.
 */

declare const __CACHE_VERSION__: string;
declare const __IMMUTABLE_ASSETS__: readonly string[];

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
const PAGE = "./index.html";
const SHELL = [
  "./",
  PAGE,
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-32.png",
  ...__IMMUTABLE_ASSETS__,
];

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

  const isPage = request.mode === "navigate";

  event.respondWith(
    (async (): Promise<Response> => {
      const cache = await caches.open(CACHE_NAME);

      if (isPage) {
        try {
          const fresh = await fetch(request);
          if (fresh.ok) {
            await cache.put(PAGE, fresh.clone());
          }
          return fresh;
        } catch {
          const cached = await cache.match(PAGE);
          return cached ?? new Response("offline", { status: 503 });
        }
      }

      const cached = await cache.match(request);
      if (cached !== undefined) {
        return cached;
      }
      try {
        const fresh = await fetch(request);
        if (fresh.ok) {
          await cache.put(request, fresh.clone());
        }
        return fresh;
      } catch {
        return new Response("offline", { status: 503 });
      }
    })(),
  );
});
