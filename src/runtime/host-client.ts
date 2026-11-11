import type { GameDTO } from '../types/game';
import type {
  BrowserAssistParams,
  BrowserAssistResult,
  EnqueueDownloadParams,
  ExtractParams,
  HttpRequestParams,
  HttpRequestResult,
  PluginMethodName,
  PluginMethods,
} from '../types/methods';
import type { RequestOptions } from './peer';

/** The part of RpcPeer that the host client needs. */
export interface HostTransport {
  request<R = unknown>(method: string, params?: unknown, options?: RequestOptions): Promise<R>;
  notify(method: string, params?: unknown): void;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface HostClient {
  /** Typed call to any plugin-to-host method. */
  call<M extends PluginMethodName>(
    method: M,
    params: PluginMethods[M]['params'],
    options?: RequestOptions,
  ): Promise<PluginMethods[M]['result']>;
  http: {
    request(params: HttpRequestParams, options?: RequestOptions): Promise<HttpRequestResult>;
  };
  secrets: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
  };
  storage: {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
  };
  downloads: {
    /** resolves with the new download id */
    enqueue(params: EnqueueDownloadParams): Promise<string>;
  };
  extract(params: ExtractParams): Promise<string>;
  library: {
    /** resolves with the number of games written */
    upsert(games: GameDTO[]): Promise<number>;
  };
  settings: {
    get(): Promise<Record<string, unknown>>;
  };
  browser: {
    /** resolves with the captured download link (or null) and the file info when the host has it */
    assist(params: BrowserAssistParams, options?: RequestOptions): Promise<BrowserAssistResult>;
  };
  log(level: LogLevel, message: string, data?: unknown): void;
  notify(level: 'info' | 'warn' | 'error' | 'success', message: string): void;
}

export function createHostClient(transport: HostTransport): HostClient {
  const call: HostClient['call'] = (method, params, options) =>
    transport.request<PluginMethods[typeof method]['result']>(method, params, options);

  return {
    call,
    http: {
      request: (params, options) => call('http.request', params, options),
    },
    secrets: {
      get: async (key) => (await call('secrets.get', { key }))?.value ?? null,
      set: async (key, value) => {
        await call('secrets.set', { key, value });
      },
      delete: async (key) => {
        await call('secrets.delete', { key });
      },
    },
    storage: {
      get: async (key) => (await call('storage.get', { key }))?.value ?? null,
      set: async (key, value) => {
        await call('storage.set', { key, value });
      },
    },
    downloads: {
      enqueue: async (params) => (await call('downloads.enqueue', params)).id,
    },
    extract: async (params) => (await call('extract', params)).destination,
    library: {
      upsert: async (games) => (await call('library.upsert', { games })).upserted,
    },
    settings: {
      get: async () => (await call('settings.get', {}))?.settings ?? {},
    },
    browser: {
      assist: (params, options) => call('browser.assist', params, options),
    },
    log: (level, message, data) => {
      transport.notify('log', data === undefined ? { level, message } : { level, message, data });
    },
    notify: (level, message) => {
      transport.notify('notify', { level, message });
    },
  };
}
