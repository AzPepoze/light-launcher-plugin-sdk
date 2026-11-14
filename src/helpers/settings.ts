import { DOWNLOAD_SETTINGS_DEFAULTS } from '../downloads/hints';
import type { DownloadSettings } from '../downloads/settings';
import type { HostClient } from '../runtime/host-client';

const SETTINGS_TIMEOUT_MS = 5_000;

export function textOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

export function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/** A parser that keeps an integer inside `min` to `max`, and otherwise uses the fallback. */
export function intInRange(min: number, max: number): (value: unknown, fallback: number) => number {
  return (value, fallback) =>
    typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

/** Reads settings through the host with a 5 s timeout, and falls back to the defaults on any error. */
export async function readSettings<T>(
  host: Pick<HostClient, 'call'>,
  parser: (raw: Record<string, unknown>) => T,
  defaults: T,
): Promise<T> {
  try {
    const { settings } = await host.call('settings.get', {}, { timeoutMs: SETTINGS_TIMEOUT_MS });
    return parser(settings);
  } catch {
    return defaults;
  }
}

export function parseDownloadSettings(raw: Record<string, unknown>): DownloadSettings {
  const defaults = DOWNLOAD_SETTINGS_DEFAULTS;
  return {
    downloadRoot: raw.downloadRoot === 'games' ? 'games' : defaults.downloadRoot,
    gameSubfolder: boolOr(raw.gameSubfolder, defaults.gameSubfolder),
    installAfterDownload: boolOr(raw.installAfterDownload, defaults.installAfterDownload),
    deleteArchiveAfterInstall: boolOr(raw.deleteArchiveAfterInstall, defaults.deleteArchiveAfterInstall),
  };
}
