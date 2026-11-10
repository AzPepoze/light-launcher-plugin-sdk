/**
 * CLI logger. Writes to stderr. Colors only when stderr is a TTY and NO_COLOR is unset.
 * Each line is one write call, so concurrent writers do not interleave within a line.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const RESET = '\x1b[0m';
const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[90m',
  info: '\x1b[32m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
};

export interface LineSink {
  write(text: string): unknown;
  isTTY?: boolean;
}

/** FNV-1a 32-bit. Stable across runs, so a category keeps its color. */
export function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** Pastel color for a category: hue from the hash, high lightness, moderate saturation. */
export function categoryColor(category: string): string {
  const [r, g, b] = hslToRgb(fnv1a(category) % 360, 0.55, 0.8);
  return `\x1b[38;2;${r};${g};${b}m`;
}

function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const sector = hue / 60;
  const secondary = chroma * (1 - Math.abs((sector % 2) - 1));
  const offset = lightness - chroma / 2;
  const [r, g, b] = hueSector(Math.floor(sector) % 6, chroma, secondary);
  return [r, g, b].map((v) => Math.round((v + offset) * 255)) as [number, number, number];
}

function hueSector(index: number, chroma: number, secondary: number): [number, number, number] {
  switch (index) {
    case 0:
      return [chroma, secondary, 0];
    case 1:
      return [secondary, chroma, 0];
    case 2:
      return [0, chroma, secondary];
    case 3:
      return [0, secondary, chroma];
    case 4:
      return [secondary, 0, chroma];
    default:
      return [chroma, 0, secondary];
  }
}

export function colorEnabled(sink: LineSink, env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(sink.isTTY) && env.NO_COLOR === undefined;
}

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export function createLogger(category: string, sink: LineSink = process.stderr, color = colorEnabled(sink)): Logger {
  const write = (level: LogLevel, message: string) => {
    sink.write(formatLine(level, category, message, color, new Date()));
  };
  return {
    debug: (message) => write('debug', message),
    info: (message) => write('info', message),
    warn: (message) => write('warn', message),
    error: (message) => write('error', message),
  };
}

export function formatLine(level: LogLevel, category: string, message: string, color: boolean, at: Date): string {
  const time = at.toTimeString().slice(0, 8);
  const tag = level.toUpperCase().padEnd(5);
  if (!color) return `${time} ${tag} [${category}] ${message}\n`;
  return `${time} ${LEVEL_COLORS[level]}${tag}${RESET} ${categoryColor(category)}[${category}]${RESET} ${message}\n`;
}
