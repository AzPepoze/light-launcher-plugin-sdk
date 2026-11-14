import { describe, expect, test } from 'bun:test';
import type { HostClient } from '../src/runtime/host-client';
import { cachedSecret } from '../src/runtime/secrets';

function fakeHost(read: (key: string) => Promise<string | null>) {
  let reads = 0;
  const host = {
    secrets: {
      get: async (key: string) => {
        reads++;
        return read(key);
      },
      set: async () => {},
      delete: async () => {},
    },
  } as unknown as Pick<HostClient, 'secrets'>;
  return { host, reads: () => reads };
}

describe('cachedSecret', () => {
  test('reads a secret once and returns null when it is absent', async () => {
    const { host, reads } = fakeHost(async (key) => (key === 'cookie' ? 'abc' : null));
    expect(await cachedSecret(host, 'cookie')).toBe('abc');
    expect(await cachedSecret(host, 'cookie')).toBe('abc');
    expect(reads()).toBe(1);
    expect(await cachedSecret(host, 'missing')).toBeNull();
    expect(reads()).toBe(2);
  });

  test('does not cache a failed read', async () => {
    const { host, reads } = fakeHost(async () => {
      throw new Error('locked');
    });
    await expect(cachedSecret(host, 'cookie')).rejects.toThrow('locked');
    await expect(cachedSecret(host, 'cookie')).rejects.toThrow('locked');
    expect(reads()).toBe(2);
  });
});
