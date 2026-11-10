import type { HostMethodName, HostMethods, HostNotifications } from '../types/methods';
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

export type PluginHandlers = { [M in HostMethodName]?: PluginHandler<M> };

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

/** Runs the plugin until the host sends shutdown or closes the input. */
export function servePlugin(
  handlers: PluginHandlers,
  io: PluginIo = stdioIo(),
  notifications: PluginNotificationHandlers = {},
): Promise<void> {
  const peer = new RpcPeer({
    write: io.write,
    requests: bindHandlers(handlers, () => host),
    notifications: notifications as Record<string, NotificationHandler>,
    endAfter: 'shutdown',
  });
  const host = createHostClient(peer);
  return peer.start(io.input);
}

type AnyHandler = (params: never, ctx: PluginContext) => unknown;

/** Shutdown needs no work from most plugins, so the runtime answers it unless the plugin does. */
const defaultHandlers: PluginHandlers = { shutdown: () => null };

function bindHandlers(handlers: PluginHandlers, host: () => HostClient): Record<string, RequestHandler> {
  const bound: Record<string, RequestHandler> = {};
  const all = { ...defaultHandlers, ...handlers };
  for (const [method, handler] of Object.entries(all) as [string, AnyHandler | undefined][]) {
    if (!handler) continue;
    bound[method] = (params, ctx) => handler(params as never, { ...ctx, host: host() });
  }
  return bound;
}
