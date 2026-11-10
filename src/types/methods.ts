/** Typed params and results for every method and notification in schema/protocol.schema.json. */
import type {
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

export interface SyncResult {
  games: GameDTO[];
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
}

export interface EnqueueDownloadResult {
  id: string;
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
}

export interface SettingsGetResult {
  settings: Record<string, unknown>;
}

export interface BrowserAssistParams {
  url: string;
  message?: string;
  timeoutMs?: number;
}

export interface BrowserAssistResult {
  capturedUrl: string | null;
}

export interface PluginMethods {
  'http.request': { params: HttpRequestParams; result: HttpRequestResult };
  'secrets.get': { params: SecretGetParams; result: SecretGetResult };
  'secrets.set': { params: SecretSetParams; result: null };
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

export interface HostNotifications {
  cancel: CancelParams;
}

export interface PluginNotifications {
  progress: ProgressParams;
  log: LogParams;
  notify: NotifyParams;
}
