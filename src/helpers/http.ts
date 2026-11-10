/**
 * Plugin-side HTTP client. Requests go to the host (`http.request`), which applies the
 * network allow-list, rate limit, retries and ETag cache. A local fetch transport is
 * kept for tests and for running a plugin outside the host.
 */
import type { HostClient } from '../runtime/host-client';
import type { HttpRequestParams, HttpRequestResult } from '../types/methods';
import { ErrorCode, RpcFailure } from '../types/protocol';

export type HttpResult = HttpRequestResult;

export interface HttpTransport {
  request(params: HttpRequestParams, options?: { signal?: AbortSignal }): Promise<HttpRequestResult>;
}

export interface HttpOptions {
  method?: 'GET' | 'HEAD' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  retries?: number;
  cacheKey?: string;
  maxBytes?: number;
  allowStatus?: number[];
  signal?: AbortSignal;
  /** throw HttpError for any status outside 2xx. A 304 still passes. */
  throwOnError?: boolean;
}

export interface HttpClientOptions {
  /** sent with every request, such as a Cookie header. Per-request headers win. */
  defaultHeaders?: Record<string, string>;
  /** response size limit used when a request sets no maxBytes */
  maxBodyBytes?: number;
}

/** A failed HTTP call. Keeps the status, the url and the start of the body. */
export class HttpError extends RpcFailure {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly bodySnippet: string,
    message: string,
  ) {
    super(status === 429 ? ErrorCode.RateLimited : ErrorCode.RemoteError, message, { status, url });
    this.name = 'HttpError';
  }
}

const BODY_SNIPPET_LENGTH = 200;

export interface ProbeResult {
  url: string;
  status: number;
  /** total bytes, 0 when unknown */
  size: number;
  ranges: boolean;
}

export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent': DEFAULT_USER_AGENT,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

/** Sends every request through the host. */
export function hostTransport(host: HostClient): HttpTransport {
  return {
    request: (params, options) => host.http.request(params, options),
  };
}

/** Local fallback. No allow-list, no retries and no cache, so use it only for tests. */
export function fetchTransport(fetchImpl: typeof fetch = fetch): HttpTransport {
  return {
    async request(params, options) {
      const signals = [AbortSignal.timeout(params.timeoutMs ?? 45_000)];
      if (options?.signal) signals.push(options.signal);
      const res = await fetchImpl(params.url, {
        method: params.method ?? 'GET',
        headers: params.headers,
        body: params.body,
        redirect: 'follow',
        signal: AbortSignal.any(signals),
      });
      const text = res.status === 204 || res.status === 304 ? '' : await res.text();
      checkStatus(res.status, params.allowStatus ?? [], params.url);
      return {
        status: res.status,
        url: res.url || params.url,
        text,
        headers: headersToRecord(res.headers),
        notModified: res.status === 304,
      };
    },
  };
}

function checkStatus(status: number, allowed: number[], url: string): void {
  if (allowed.includes(status)) return;
  if (status === 429) throw new RpcFailure(ErrorCode.RateLimited, `rate limited: ${url}`);
  if (status >= 500) throw new RpcFailure(ErrorCode.RemoteError, `HTTP ${status}: ${url}`);
}

function assertSuccess(res: HttpResult, url: string): void {
  if (res.status === 304 || (res.status >= 200 && res.status < 300)) return;
  const message = `HTTP ${res.status} from ${url}`;
  throw new HttpError(res.status, res.url || url, res.text.slice(0, BODY_SNIPPET_LENGTH), message);
}

function headersToRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

export class HttpClient {
  constructor(
    private readonly transport: HttpTransport,
    private readonly options: HttpClientOptions = {},
  ) {}

  async request(url: string, options: HttpOptions = {}): Promise<HttpResult> {
    const { signal, throwOnError, ...params } = options;
    const res = await this.transport.request(
      {
        url,
        ...params,
        headers: { ...DEFAULT_HEADERS, ...this.options.defaultHeaders, ...options.headers },
        maxBytes: options.maxBytes ?? this.options.maxBodyBytes,
      },
      { signal },
    );
    if (throwOnError) assertSuccess(res, url);
    return res;
  }

  /** Throws HttpError with the status for a failed call or a body that is not JSON. */
  async json<T>(url: string, options: HttpOptions = {}): Promise<T> {
    const res = await this.request(url, {
      ...options,
      throwOnError: true,
      headers: { Accept: 'application/json', ...options.headers },
    });
    try {
      return JSON.parse(res.text) as T;
    } catch {
      throw new HttpError(res.status, res.url || url, res.text.slice(0, BODY_SNIPPET_LENGTH), `invalid JSON from ${url}`);
    }
  }

  /** Total size, range support and final url. Tries HEAD first, then a 1-byte ranged GET. */
  async probe(url: string, headers: Record<string, string> = {}): Promise<ProbeResult> {
    const head = await this.request(url, { method: 'HEAD', headers, allowStatus: [405] }).catch(() => null);
    if (head && head.status < 400 && head.headers['content-length']) {
      return {
        url: head.url,
        status: head.status,
        size: Number(head.headers['content-length']) || 0,
        ranges: (head.headers['accept-ranges'] ?? '').toLowerCase().includes('bytes'),
      };
    }
    const ranged = await this.request(url, { headers: { ...headers, Range: 'bytes=0-0' } });
    const total = ranged.headers['content-range']?.match(/\/(\d+)/)?.[1];
    return {
      url: ranged.url,
      status: ranged.status,
      size: total ? Number(total) : Number(ranged.headers['content-length'] ?? 0) || 0,
      ranges: ranged.status === 206,
    };
  }
}
