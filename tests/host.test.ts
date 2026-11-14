import { describe, expect, test } from 'bun:test';
import type { HostServices } from '../src/runtime';

describe('HostServices', () => {
  test('a plugin can provide every shared service', async () => {
    const seen: string[] = [];
    const services: HostServices = {
      http: {
        request: async (url) => ({ status: 200, url, text: '', headers: {}, notModified: false }),
        json: async <T>() => ({}) as T,
      },
      secrets: {
        get: async () => null,
        set: async () => {},
        delete: async () => {},
      },
      storage: {
        get: async () => null,
        set: async () => {},
      },
      settings: async () => ({ requestDelayMs: 10 }),
      dump: (name) => seen.push(`dump:${name}`),
      log: (level) => seen.push(`log:${level}`),
    };

    expect((await services.settings()).requestDelayMs).toBe(10);
    services.dump('page', '<html></html>');
    services.log('warn', 'slow');
    expect(seen).toEqual(['dump:page', 'log:warn']);
  });
});
