import { describe, expect, test } from 'bun:test';
import { categoryColor, colorEnabled, createLogger, formatLine, type LineSink } from '../src/runtime/logger';

function memorySink(isTTY = false): LineSink & { text: string } {
  const sink = {
    text: '',
    isTTY,
    write(chunk: string) {
      sink.text += chunk;
      return true;
    },
  };
  return sink;
}

describe('logger', () => {
  test('writes level, time and category on one line, with no escape codes by default', () => {
    const line = formatLine('warn', 'pack', 'careful', false, new Date(2026, 0, 1, 9, 5, 7));
    expect(line).toBe('09:05:07 WARN  [pack] careful\n');
    expect(line).not.toContain('\x1b');
  });

  test('uses colors only on a TTY and when NO_COLOR is unset', () => {
    expect(colorEnabled(memorySink(true), {})).toBe(true);
    expect(colorEnabled(memorySink(false), {})).toBe(false);
    expect(colorEnabled(memorySink(true), { NO_COLOR: '1' })).toBe(false);
  });

  test('a category keeps the same color across calls, and levels use their own colors', () => {
    expect(categoryColor('pack')).toBe(categoryColor('pack'));
    expect(categoryColor('pack')).not.toBe(categoryColor('test'));

    const sink = memorySink();
    createLogger('pack', sink, true).warn('one');
    createLogger('pack', sink, true).error('two');
    expect(sink.text).toContain('\x1b[33m');
    expect(sink.text).toContain('\x1b[31m');
  });
});
