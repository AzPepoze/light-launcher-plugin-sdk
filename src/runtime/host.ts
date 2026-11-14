import type { HttpClient } from '../helpers/http';
import type { HostClient } from './host-client';
import type { LogLevel } from './logger';

/** The services a plugin reads from its host. Extend it with plugin-specific ones. */
export interface HostServices<Settings = Record<string, unknown>> {
  http: Pick<HttpClient, 'request' | 'json'>;
  secrets: HostClient['secrets'];
  storage: HostClient['storage'];
  settings(): Promise<Settings>;
  /** Save a raw page when parsing fails; a no-op when dumps are off. */
  dump(name: string, body: string): void;
  log(level: LogLevel, message: string, extra?: unknown): void;
}
