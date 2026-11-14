import type { HostClient } from './host-client';

const caches = new WeakMap<object, Map<string, Promise<string | null>>>();

/** Reads a secret once and keeps the value for the life of the process; null when it is absent. */
export function cachedSecret(host: Pick<HostClient, 'secrets'>, key: string): Promise<string | null> {
  let cache = caches.get(host);
  if (!cache) {
    cache = new Map();
    caches.set(host, cache);
  }
  let value = cache.get(key);
  if (!value) {
    value = host.secrets.get(key).catch((err: unknown) => {
      cache.delete(key);
      throw err;
    });
    cache.set(key, value);
  }
  return value;
}
