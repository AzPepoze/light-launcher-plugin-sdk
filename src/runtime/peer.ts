import {
  ErrorCode,
  JSONRPC_VERSION,
  RpcFailure,
  type RequestId,
  type RpcError,
  type RpcMessage,
  type RpcNotification,
  type RpcRequest,
  type RpcResponse,
} from '../types/protocol';
import { decodeLine, encodeLine, readLines } from './ndjson';

export interface ProgressReport {
  done?: number;
  total?: number | null;
  message?: string;
}

/** How long shutdown waits for requests that are still running. */
export const SHUTDOWN_GRACE_MS = 2000;

/** Given to every incoming request handler. */
export interface CallContext {
  id: RequestId;
  /** the id of this inbound request, the same as id */
  requestId: RequestId;
  /** aborted when the host sends cancel for this request */
  signal: AbortSignal;
  progress(report: ProgressReport): void;
}

export type RequestHandler = (params: unknown, ctx: CallContext) => unknown;
export type NotificationHandler = (params: unknown) => void;

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface PeerOptions {
  write: (line: string) => void;
  requests: Record<string, RequestHandler>;
  notifications?: Record<string, NotificationHandler>;
  /** the peer closes after answering this method, such as shutdown */
  endAfter?: string;
  shutdownGraceMs?: number;
}

interface Pending {
  resolve(value: unknown): void;
  reject(error: Error): void;
  cleanup(): void;
}

interface Inbound {
  controller: AbortController;
  /** resolves when the handler has answered; never rejects */
  settled: Promise<void>;
}

export class RpcPeer {
  private nextId = 1;
  private readonly pending = new Map<RequestId, Pending>();
  private readonly inbound = new Map<RequestId, Inbound>();
  private readonly closed: Promise<void>;
  private resolveClosed!: () => void;
  private readonly stopReading = new AbortController();
  private isClosed = false;

  constructor(private readonly options: PeerOptions) {
    this.closed = new Promise<void>((resolve) => {
      this.resolveClosed = resolve;
    });
  }

  /** Starts reading lines. Resolves when the input ends or the peer closes. */
  start(input: ReadableStream<Uint8Array>): Promise<void> {
    readLines(input, (line) => this.receive(line), this.stopReading.signal)
      .catch(() => {})
      .finally(() => this.close());
    return this.closed;
  }

  /** Sends a request and resolves with its result. */
  request<R = unknown>(method: string, params?: unknown, options: RequestOptions = {}): Promise<R> {
    if (this.isClosed) return Promise.reject(new RpcFailure(ErrorCode.InternalError, 'connection closed'));
    if (options.signal?.aborted) return Promise.reject(new RpcFailure(ErrorCode.Canceled, 'request canceled'));

    const id = this.nextId++;
    return new Promise<R>((resolve, reject) => {
      const timer = options.timeoutMs
        ? setTimeout(() => this.settle(id, new RpcFailure(ErrorCode.Timeout, `${method} timed out`)), options.timeoutMs)
        : undefined;
      const onAbort = () => this.settle(id, new RpcFailure(ErrorCode.Canceled, 'request canceled'));
      options.signal?.addEventListener('abort', onAbort, { once: true });
      this.pending.set(id, {
        resolve: (value) => resolve(value as R),
        reject,
        cleanup: () => {
          if (timer) clearTimeout(timer);
          options.signal?.removeEventListener('abort', onAbort);
        },
      });
      this.send({ jsonrpc: JSONRPC_VERSION, id, method, ...(params === undefined ? {} : { params }) });
    });
  }

  notify(method: string, params?: unknown): void {
    this.send({ jsonrpc: JSONRPC_VERSION, method, ...(params === undefined ? {} : { params }) });
  }

  /** Rejects pending calls and stops answering. Safe to call twice. */
  close(): void {
    if (this.isClosed) return;
    this.isClosed = true;
    for (const id of [...this.pending.keys()]) {
      this.settle(id, new RpcFailure(ErrorCode.InternalError, 'connection closed'));
    }
    for (const call of this.inbound.values()) call.controller.abort();
    this.inbound.clear();
    this.stopReading.abort();
    this.resolveClosed();
  }

  private receive(line: string): void {
    if (this.isClosed) return;
    let message: RpcMessage;
    try {
      message = decodeLine(line);
    } catch (err) {
      const failure = err instanceof RpcFailure ? err : new RpcFailure(ErrorCode.InternalError, String(err));
      this.sendError(null, failure);
      return;
    }
    if ('method' in message && 'id' in message) this.handleRequest(message);
    else if ('method' in message) this.handleNotification(message);
    else this.handleResponse(message);
  }

  private handleResponse(response: RpcResponse): void {
    if (response.id === null) return;
    if (response.error) {
      this.settle(response.id, new RpcFailure(response.error.code, response.error.message, response.error.data));
    } else {
      this.settle(response.id, undefined, response.result);
    }
  }

  private settle(id: RequestId, failure?: RpcFailure, value?: unknown): void {
    const entry = this.pending.get(id);
    if (!entry) return;
    this.pending.delete(id);
    entry.cleanup();
    if (failure) entry.reject(failure);
    else entry.resolve(value);
  }

  private handleRequest(request: RpcRequest): void {
    const handler = this.options.requests[request.method];
    if (!handler) {
      this.sendError(request.id, new RpcFailure(ErrorCode.MethodNotFound, `method not found: ${request.method}`));
      this.finishRequest(request.method);
      return;
    }
    const controller = new AbortController();
    const ctx: CallContext = {
      id: request.id,
      requestId: request.id,
      signal: controller.signal,
      progress: (report) => this.notify('progress', { id: request.id, ...report }),
    };
    const settled = this.runHandler(handler, request, ctx, controller);
    this.inbound.set(request.id, { controller, settled });
  }

  private async runHandler(
    handler: RequestHandler,
    request: RpcRequest,
    ctx: CallContext,
    controller: AbortController,
  ): Promise<void> {
    try {
      if (request.method === this.options.endAfter) await this.waitForInFlight(request.id);
      const result = await handler(request.params, ctx);
      this.inbound.delete(request.id);
      this.send({ jsonrpc: JSONRPC_VERSION, id: request.id, result: result ?? null });
    } catch (err) {
      this.inbound.delete(request.id);
      this.sendError(request.id, toFailure(err, controller.signal.aborted));
    }
    this.finishRequest(request.method);
  }

  /** Lets the other inbound requests finish, so their answers are not lost when the peer closes. */
  private async waitForInFlight(exceptId: RequestId): Promise<void> {
    const others = [...this.inbound.entries()]
      .filter(([id]) => id !== exceptId)
      .map(([, call]) => call.settled);
    if (others.length === 0) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const grace = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, this.options.shutdownGraceMs ?? SHUTDOWN_GRACE_MS);
    });
    try {
      await Promise.race([Promise.allSettled(others), grace]);
    } finally {
      clearTimeout(timer);
    }
  }

  private finishRequest(method: string): void {
    if (method === this.options.endAfter) this.close();
  }

  private handleNotification(notification: RpcNotification): void {
    if (notification.method === 'cancel') {
      const id = (notification.params as { id?: RequestId } | undefined)?.id;
      if (id !== undefined) this.inbound.get(id)?.controller.abort();
      return;
    }
    this.options.notifications?.[notification.method]?.(notification.params);
  }

  private sendError(id: RequestId | null, failure: RpcFailure): void {
    const error: RpcError = { code: failure.code, message: failure.message };
    if (failure.data !== undefined) error.data = failure.data;
    this.send({ jsonrpc: JSONRPC_VERSION, id, error });
  }

  private send(message: object): void {
    if (this.isClosed) return;
    this.options.write(encodeLine(message));
  }
}

function toFailure(err: unknown, canceled: boolean): RpcFailure {
  if (err instanceof RpcFailure) return err;
  if (canceled) return new RpcFailure(ErrorCode.Canceled, 'request canceled');
  const message = err instanceof Error ? err.message : String(err);
  return new RpcFailure(ErrorCode.InternalError, message);
}
