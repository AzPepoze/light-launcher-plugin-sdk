import type { AuthState, FileCandidate, GameDTO, GameRef, ProviderCapabilities, Ref, UpdateInfo } from '../types/game';
import type {
  BrowseParams,
  BrowseResult,
  ListFiltersParams,
  ListFiltersResult,
  ListGamesParams,
  ListGamesResult,
  PrepareDownloadResult,
  SyncResult,
} from '../types/methods';
import { ErrorCode, RpcFailure } from '../types/protocol';
import type { ProgressReport } from './peer';
import type { PluginHandlers } from './serve';

/** Cancel and progress for a long call. The source.* handlers fill it from the request. */
export interface CallHooks {
  signal?: AbortSignal;
  progress?: (report: ProgressReport) => void;
}

export interface ListOptions {
  url?: string;
  query?: string;
  page?: number;
}

/** What a game source implements. sourceHandlers maps it onto the source.* methods. */
export interface SourceProvider {
  readonly id: string;
  readonly capabilities: ProviderCapabilities;

  /** A URL to a ref. null when the URL is not this source's. */
  parseRef(url: string): Ref | null;

  authStatus(): Promise<AuthState>;
  setCredential(value: string): Promise<AuthState>;
  clearCredential(): Promise<AuthState>;

  fetchGame(ref: Ref): Promise<GameDTO>;
  /** One page of a listing or a search. */
  fetchList(options: ListOptions): Promise<GameDTO[]>;

  resolveFiles(game: GameRef): Promise<FileCandidate[]>;
  prepareDownload(file: FileCandidate, game: GameRef, hooks: CallHooks): Promise<PrepareDownloadResult>;
  checkUpdate(game: GameRef): Promise<UpdateInfo | null>;

  /** Only for a source that declares sync:games or sync:index. */
  sync?(hooks: CallHooks): Promise<SyncResult>;

  /** Only for a source that declares the listGames capability. */
  listGames?(params: ListGamesParams, hooks: CallHooks): Promise<ListGamesResult>;

  /** Only for a source that declares the browse:filters capability. */
  browse?(params: BrowseParams, hooks: CallHooks): Promise<BrowseResult>;

  /** Only for a source that declares the browse:filters capability. */
  listFilters?(params: ListFiltersParams, hooks: CallHooks): Promise<ListFiltersResult>;
}

/** A provider, or a function that returns it once initialize has built it. */
export type SourceProviderSource = SourceProvider | (() => SourceProvider);

/**
 * Handlers for the source.* methods of one source. A request for another source id
 * gets error -32602.
 */
export function sourceHandlers(provider: SourceProviderSource, sourceId: string): PluginHandlers {
  const current = typeof provider === 'function' ? provider : () => provider;
  const forSource = (source: string): SourceProvider => {
    if (source !== sourceId) throw new RpcFailure(ErrorCode.InvalidParams, `unknown source: ${source}`);
    return current();
  };

  return {
    'source.parseRef': ({ url }) => current().parseRef(url),
    'source.authStatus': ({ source }) => forSource(source).authStatus(),
    'source.setCredential': ({ source, value }) => forSource(source).setCredential(value),
    'source.clearCredential': ({ source }) => forSource(source).clearCredential(),
    'source.search': async ({ source, url, query, page }) => ({
      games: await forSource(source).fetchList({ url, query, page }),
    }),
    'source.fetchGame': async ({ source, ref }) => ({ game: await forSource(source).fetchGame(ref) }),
    'source.resolveFiles': async ({ source, game }) => ({ files: await forSource(source).resolveFiles(game) }),
    'source.prepareDownload': ({ source, file, game }, ctx) =>
      forSource(source).prepareDownload(file, game, { signal: ctx.signal, progress: ctx.progress }),
    'source.checkUpdate': async ({ source, game }) => ({ update: await forSource(source).checkUpdate(game) }),
    'source.sync': async ({ source }, ctx) => {
      const target = forSource(source);
      if (!target.sync) throw new RpcFailure(ErrorCode.MethodNotFound, `source ${source} has no sync`);
      return target.sync({ signal: ctx.signal, progress: ctx.progress });
    },
    'source.listGames': (params, ctx) => listGamesOf(forSource(params.source), params, ctx),
    'source.browse': (params, ctx) => browseOf(forSource(params.source), params, ctx),
    'source.listFilters': (params, ctx) => listFiltersOf(forSource(params.source), params, ctx),
  };
}

async function listGamesOf(target: SourceProvider, params: ListGamesParams, hooks: CallHooks): Promise<ListGamesResult> {
  if (!target.listGames) throw new RpcFailure(ErrorCode.MethodNotFound, `source ${params.source} has no listGames`);
  return target.listGames(params, { signal: hooks.signal, progress: hooks.progress });
}

async function browseOf(target: SourceProvider, params: BrowseParams, hooks: CallHooks): Promise<BrowseResult> {
  if (!target.browse) throw new RpcFailure(ErrorCode.MethodNotFound, `source ${params.source} has no browse`);
  return target.browse(params, { signal: hooks.signal, progress: hooks.progress });
}

async function listFiltersOf(target: SourceProvider, params: ListFiltersParams, hooks: CallHooks): Promise<ListFiltersResult> {
  if (!target.listFilters) throw new RpcFailure(ErrorCode.MethodNotFound, `source ${params.source} has no listFilters`);
  return target.listFilters(params, { signal: hooks.signal, progress: hooks.progress });
}
