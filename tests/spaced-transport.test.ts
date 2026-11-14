import { describe, expect, test } from 'bun:test';
import { spacedTransport, type HttpTransport } from '../src/helpers';

function recordingTransport(starts: number[]): HttpTransport {
  return {
    async request(params) {
      starts.push(Date.now());
      return { status: 200, url: params.url, text: '', headers: {}, notModified: false };
    },
  };
}

describe('spacedTransport', () => {
  test('starts concurrent requests in order, at least minDelayMs apart', async () => {
    const starts: number[] = [];
    const transport = spacedTransport(recordingTransport(starts), { minDelayMs: 40 });
    await Promise.all([transport.request({ url: 'https://a.test/' }), transport.request({ url: 'https://b.test/' })]);
    expect(starts).toHaveLength(2);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(30);
  });

  test('returns the inner transport when no delay is set', () => {
    const inner = recordingTransport([]);
    expect(spacedTransport(inner, { minDelayMs: 0 })).toBe(inner);
  });
});
