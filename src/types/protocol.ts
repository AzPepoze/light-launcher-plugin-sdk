/** JSON-RPC 2.0 envelopes and error codes. One JSON object per line on stdio. */

export const JSONRPC_VERSION = '2.0';

export type RequestId = string | number;

export interface RpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface RpcRequest<P = unknown> {
  jsonrpc: typeof JSONRPC_VERSION;
  id: RequestId;
  method: string;
  params?: P;
}

export interface RpcResponse<R = unknown> {
  jsonrpc: typeof JSONRPC_VERSION;
  /** null only when the request line could not be parsed */
  id: RequestId | null;
  result?: R;
  error?: RpcError;
}

export interface RpcNotification<P = unknown> {
  jsonrpc: typeof JSONRPC_VERSION;
  method: string;
  params?: P;
}

export type RpcMessage = RpcRequest | RpcResponse | RpcNotification;

export const ErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  PermissionDenied: -32001,
  Canceled: -32002,
  Timeout: -32003,
  RateLimited: -32004,
  RemoteError: -32005,
  NotModified: -32006,
  /** The message is "invalid_cursor". The cursor is not one this query issued. */
  InvalidCursor: -32007,
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Error thrown by the host or plugin with a protocol error code. */
export class RpcFailure extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = 'RpcFailure';
  }
}
