/** Typed params and results for every method and notification in schema/protocol.schema.json. */
import type {
  AuthState,
  FileCandidate,
  GameDTO,
  GameRef,
  Platform,
  ProviderCapabilities,
  Ref,
  UpdateInfo,
} from './game';
import type { PluginPermissions } from './manifest';
import type { RequestId } from './protocol';

export type GrantedPermissions = Required<PluginPermissions>;

// ---------------------------------------------------------------------------
// host -> plugin
// ---------------------------------------------------------------------------

export interface InitializeParams {
  hostVersion: string;
  apiVersion: string;
  platform: Platform;
  grantedPermissions: GrantedPermissions;
  /** private folder for this plugin. Keep caches and indexes here. */
  dataDir: string;
}

export interface InitializeResult {
  pluginVersion: string;
  /** keyed by source id */
  capabilities: Record<string, ProviderCapabilities>;
}

export interface SearchParams {
  source: string;
  url?: string;
  query?: string;
  page?: number;
}

export interface SearchResult {
  games: GameDTO[];
}

export interface FetchGameParams {
  source: string;
  ref: Ref;
}

export interface FetchGameResult {
  game: GameDTO;
}

export interface ResolveFilesParams {
  source: string;
  game: GameRef;
}

export interface ResolveFilesResult {
  files: FileCandidate[];
}

export interface PrepareDownloadParams {
  source: string;
  file: FileCandidate;
  game: GameRef;
}

export interface PrepareDownloadResult {
  url: string;
  headers: Record<string, string>;
  /** the file name, when the plugin knows it */
  filename?: string;
  /** the size in bytes, when the plugin knows it */
  size?: number;
  /** 'downloads' (default) or 'games'. 'games' needs the $GAMES fs grant. */
  root?: DownloadRoot;
  /** Relative folder under root, such as 'Team/Demo'. */
  subfolder?: string;
  /** Install the archive after the download. Needs the $GAMES fs grant. */
  install?: boolean;
  /** Relative folder under the games folder for the installed game. Needs install. */
  installSubfolder?: string;
  /** Delete the archive after a successful install. Omit to use the launcher setting. Needs install. */
  deleteArchive?: boolean;
}

export interface CheckUpdateParams {
  source: string;
  game: GameRef;
}

export interface CheckUpdateResult {
  update: UpdateInfo | null;
}

export interface SyncParams {
  source: string;
}

/** Summary of a sync:index source. The index itself stays in the plugin's dataDir. */
export interface SyncStatus {
  count: number;
  syncedAt: string | null;
  /** true while a sync is still running */
  running: boolean;
}

/**
 * source.sync answers with a SyncStatus for a "sync:index" source,
 * or with the games for a "sync:games" source.
 */
export type SyncResult = SyncStatus | GameDTO[];

export interface AuthStatusParams {
  source: string;
}

export interface SetCredentialParams {
  source: string;
  /** the secret the user typed, such as a cookie or an API key */
  value: string;
}

export interface ClearCredentialParams {
  source: string;
}

export interface ParseRefParams {
  url: string;
}

export interface HostMethods {
  initialize: { params: InitializeParams; result: InitializeResult };
  shutdown: { params: Record<string, never>; result: null };
  'source.search': { params: SearchParams; result: SearchResult };
  'source.fetchGame': { params: FetchGameParams; result: FetchGameResult };
  'source.resolveFiles': { params: ResolveFilesParams; result: ResolveFilesResult };
  'source.prepareDownload': { params: PrepareDownloadParams; result: PrepareDownloadResult };
  'source.checkUpdate': { params: CheckUpdateParams; result: CheckUpdateResult };
  'source.sync': { params: SyncParams; result: SyncResult };
  /** The plugin validates the credential, then saves it with secrets.set. */
  'source.setCredential': { params: SetCredentialParams; result: AuthState };
  'source.authStatus': { params: AuthStatusParams; result: AuthState };
  /** Removes the credential with secrets.delete. */
  'source.clearCredential': { params: ClearCredentialParams; result: AuthState };
  /** Returns the ref for a URL the plugin understands, or null. */
  'source.parseRef': { params: ParseRefParams; result: Ref | null };
}

export type HostMethodName = keyof HostMethods;

// ---------------------------------------------------------------------------
// plugin -> host (services)
// ---------------------------------------------------------------------------

export interface HttpRequestParams {
  url: string;
  method?: 'GET' | 'HEAD' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  retries?: number;
  cacheKey?: string;
  maxBytes?: number;
  allowStatus?: number[];
}

export interface HttpRequestResult {
  status: number;
  url: string;
  text: string;
  headers: Record<string, string>;
  notModified: boolean;
}

export interface SecretGetParams {
  key: string;
}

export interface SecretGetResult {
  value: string | null;
}

export interface SecretSetParams {
  key: string;
  value: string;
}

export interface SecretDeleteParams {
  key: string;
}

export interface StorageGetParams {
  key: string;
}

export interface StorageGetResult {
  value: unknown;
}

export interface StorageSetParams {
  key: string;
  value: unknown;
}

export interface EnqueueDownloadParams {
  url: string;
  filename: string;
  title?: string;
  size?: number;
  headers?: Record<string, string>;
  /** Library id of the game this file belongs to, from library.upsert. */
  gameId?: number;
  /** 'downloads' (default) or 'games'. 'games' needs the $GAMES fs grant. */
  root?: DownloadRoot;
  /** Relative folder under root, such as 'Team/Demo'. */
  subfolder?: string;
  /** Install the archive after the download. Needs the $GAMES fs grant. */
  install?: boolean;
  /** Relative folder under the games folder for the installed game. Needs install. */
  installSubfolder?: string;
  /** Delete the archive after a successful install. Omit to use the launcher setting. Needs install. */
  deleteArchive?: boolean;
}

export type DownloadRoot = 'downloads' | 'games';

export interface EnqueueDownloadResult {
  /** The launcher's queue id for the download. */
  id: number;
}

export interface ExtractParams {
  archive: string;
  destination: string;
}

export interface ExtractResult {
  destination: string;
}

export interface LibraryUpsertParams {
  games: GameDTO[];
}

export interface LibraryUpsertResult {
  upserted: number;
  /** Library id of each game, in the order sent. Pass one as gameId to downloads.enqueue. */
  ids: number[];
}

export interface SettingsGetResult {
  settings: Record<string, unknown>;
}

export interface BrowserAssistParams {
  url: string;
  timeoutMs?: number;
  /** echoed in browser.progress and browser.waiting, so the plugin can match them to this call */
  token?: string;
}

export interface BrowserAssistResult {
  /** the download link the browser caught, or null when nothing was caught */
  capturedUrl: string | null;
  filename?: string;
  size?: number;
  /** headers the download needs, such as Cookie */
  headers?: Record<string, string>;
}

export interface PluginMethods {
  'http.request': { params: HttpRequestParams; result: HttpRequestResult };
  'secrets.get': { params: SecretGetParams; result: SecretGetResult };
  'secrets.set': { params: SecretSetParams; result: null };
  'secrets.delete': { params: SecretDeleteParams; result: null };
  'storage.get': { params: StorageGetParams; result: StorageGetResult };
  'storage.set': { params: StorageSetParams; result: null };
  'downloads.enqueue': { params: EnqueueDownloadParams; result: EnqueueDownloadResult };
  extract: { params: ExtractParams; result: ExtractResult };
  'library.upsert': { params: LibraryUpsertParams; result: LibraryUpsertResult };
  'settings.get': { params: Record<string, never>; result: SettingsGetResult };
  'browser.assist': { params: BrowserAssistParams; result: BrowserAssistResult };
}

export type PluginMethodName = keyof PluginMethods;

// ---------------------------------------------------------------------------
// notifications (no response)
// ---------------------------------------------------------------------------

export interface CancelParams {
  id: RequestId;
}

export interface ProgressParams {
  id: RequestId;
  done?: number;
  total?: number | null;
  message?: string;
}

export interface LogParams {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  data?: unknown;
}

export interface NotifyParams {
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
}

/**
 * Sent by the launcher while a browser.assist call is open. token is the token the plugin
 * sent with that call, or its request id as a string when it sent none.
 */
export interface BrowserProgressParams {
  token: string;
  percent: number;
  message?: string;
}

export interface BrowserWaitingParams {
  token: string;
  message: string;
}

/** Sent by the launcher after the user saves settings. Defaults are already applied. */
export interface SettingsChangedParams {
  settings: Record<string, unknown>;
}

export interface HostNotifications {
  cancel: CancelParams;
  'browser.progress': BrowserProgressParams;
  'browser.waiting': BrowserWaitingParams;
  'settings.changed': SettingsChangedParams;
}

export interface PluginNotifications {
  progress: ProgressParams;
  log: LogParams;
  notify: NotifyParams;
}
