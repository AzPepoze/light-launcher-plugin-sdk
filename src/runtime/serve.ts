import { paramProblems } from '../schema/params';
import type { HostMethodName, HostMethods, HostNotifications } from '../types/methods';
import { ErrorCode, RpcFailure } from '../types/protocol';
import { createHostClient, type HostClient } from './host-client';
import { RpcPeer, type CallContext, type NotificationHandler, type RequestHandler } from './peer';

/** Handler context: the call context plus the typed host client. */
export interface PluginContext extends CallContext {
  host: HostClient;
}

export type PluginHandler<M extends HostMethodName> = (
  params: HostMethods[M]['params'],
  ctx: PluginContext,
) => HostMethods[M]['result'] | Promise<HostMethods[M]['result']>;

/** A handler for a method the plugin defines, typed by its entry in a `{ params, result }` map. */
export type CustomHandler<Method> = Method extends { params: infer P; result: infer R }
  ? (params: P, ctx: PluginContext) => R | Promise<R>
  : never;

/**
 * Handlers for the source methods, plus any plugin-defined methods. Pass the map of
 * plugin methods as the type argument: `PluginHandlers<{ 'my.run': { params: ...; result: ... } }>`.
 */
export type PluginHandlers<Custom = Record<never, never>> = { [M in HostMethodName]?: PluginHandler<M> } & {
  [M in keyof Custom]?: CustomHandler<Custom[M]>;
};

/** Launcher notifications the plugin can listen to. cancel is handled by the runtime itself. */
export type PluginNotificationHandlers = {
  [M in Exclude<keyof HostNotifications, 'cancel'>]?: (params: HostNotifications[M]) => void;
};

/** Where the protocol lines come from and go to. */
export interface PluginIo {
  input: ReadableStream<Uint8Array>;
  write: (line: string) => void;
}

/** Real stdio. stdout carries protocol lines only, so log to the host, not to stdout. */
export function stdioIo(): PluginIo {
  return {
    input: Bun.stdin.stream(),
    write: (line) => {
      process.stdout.write(line);
    },
  };
}

export interface ServeOptions {
  /** Check launcher params against protocol.schema.json. Bad params get -32602. Default false. */
  validateParams?: boolean;
}

/** Runs the plugin until the host sends shutdown or closes the input. */
export function servePlugin(
  handlers: PluginHandlers,
  io: PluginIo = stdioIo(),
  notifications: PluginNotificationHandlers = {},
  options: ServeOptions = {},
): Promise<void> {
  const peer = new RpcPeer({
    write: io.write,
    requests: bindHandlers(handlers, () => host, options.validateParams ?? false),
    notifications: notifications as Record<string, NotificationHandler>,
    endAfter: 'shutdown',
  });
  const host = createHostClient(peer);
  return peer.start(io.input);
}

type AnyHandler = (params: never, ctx: PluginContext) => unknown;

/** Shutdown needs no work from most plugins, so the runtime answers it unless the plugin does. */
const defaultHandlers: PluginHandlers = { shutdown: () => null };

function bindHandlers(
  handlers: object,
  host: () => HostClient,
  validateParams: boolean,
): Record<string, RequestHandler> {
  const bound: Record<string, RequestHandler> = {};
  const all = { ...defaultHandlers, ...handlers };
  for (const [method, handler] of Object.entries(all) as [string, AnyHandler | undefined][]) {
    if (!handler) continue;
    bound[method] = (params, ctx) => {
      if (validateParams) requireValidParams(method, params);
      return handler(params as never, { ...ctx, host: host() });
    };
  }
  return bound;
}

function requireValidParams(method: string, params: unknown): void {
  const problems = paramProblems(method, params);
  if (problems.length) {
    throw new RpcFailure(ErrorCode.InvalidParams, `invalid params for ${method}: ${problems.join('; ')}`);
  }
}
