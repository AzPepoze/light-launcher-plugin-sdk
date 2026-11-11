import { paramProblems } from '../schema/params';
import type { HostMethodName, HostMethods, HostNotifications, SettingsChangedParams } from '../types/methods';
import { ErrorCode, RpcFailure } from '../types/protocol';
import { createHostClient, type HostClient } from './host-client';
import { RpcPeer, type CallContext, type NotificationHandler, type RequestHandler } from './peer';

/** Called with the new settings when the launcher sends settings.changed. */
export type SettingsChangedHandler = (settings: Record<string, unknown>) => void;

/** Handler context: the call context plus the typed host client. */
export interface PluginContext extends CallContext {
  host: HostClient;
  /** Listens while this request runs. The listener is dropped when the handler answers. */
  onSettingsChanged(handler: SettingsChangedHandler): void;
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
  const settingsListeners = new Set<SettingsChangedHandler>();
  const peer = new RpcPeer({
    write: io.write,
    requests: bindHandlers(handlers, () => host, options.validateParams ?? false, settingsListeners),
    notifications: withSettingsChanged(notifications, settingsListeners),
    endAfter: 'shutdown',
  });
  const host = createHostClient(peer);
  return peer.start(io.input);
}

type AnyHandler = (params: never, ctx: PluginContext) => unknown;

/** Shutdown needs no work from most plugins, so the runtime answers it unless the plugin does. */
const defaultHandlers: PluginHandlers = { shutdown: () => null };

function withSettingsChanged(
  handlers: PluginNotificationHandlers,
  listeners: Set<SettingsChangedHandler>,
): Record<string, NotificationHandler> {
  return {
    ...(handlers as Record<string, NotificationHandler>),
    'settings.changed': (params) => {
      const settings = (params as SettingsChangedParams | undefined)?.settings ?? {};
      for (const listener of [...listeners]) listener(settings);
      handlers['settings.changed']?.(params as SettingsChangedParams);
    },
  };
}

function bindHandlers(
  handlers: object,
  host: () => HostClient,
  validateParams: boolean,
  settingsListeners: Set<SettingsChangedHandler>,
): Record<string, RequestHandler> {
  const bound: Record<string, RequestHandler> = {};
  const all = { ...defaultHandlers, ...handlers };
  for (const [method, handler] of Object.entries(all) as [string, AnyHandler | undefined][]) {
    if (!handler) continue;
    bound[method] = (params, ctx) => {
      if (validateParams) requireValidParams(method, params);
      const owned = new Set<SettingsChangedHandler>();
      let active = true;
      const release = () => {
        active = false;
        for (const listener of owned) settingsListeners.delete(listener);
        owned.clear();
      };
      const pluginCtx: PluginContext = {
        ...ctx,
        host: host(),
        onSettingsChanged: (listener) => {
          if (!active) return;
          owned.add(listener);
          settingsListeners.add(listener);
        },
      };
      try {
        const result = handler(params as never, pluginCtx);
        if (result instanceof Promise) {
          result.then(release, release);
          return result;
        }
        release();
        return result;
      } catch (err) {
        release();
        throw err;
      }
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
