// Copied from interesting-launcher src/server/core/types.ts (provider contract only).
// No DB rows, no UI types. Keep in sync with schema/protocol.schema.json $defs.

export type GameStatus = 'ongoing' | 'completed' | 'abandoned' | 'onhold' | 'unknown';
export type Platform = 'windows' | 'linux' | 'mac' | 'android' | 'unknown';
export type FileKind = 'mirror' | 'attachment' | 'direct' | 'external';
export type AuthKind = 'none' | 'cookie' | 'apikey';
export type AuthStatus = 'unconfigured' | 'ok' | 'expired' | 'invalid' | 'error';

/** A game as a source reports it. */
export interface GameDTO {
  source: string;
  sourceId: string;
  url: string;
  title: string;
  version?: string | null;
  developer?: string | null;
  engine?: string | null;
  tags?: string[];
  coverUrl?: string | null;
  screenshots?: string[];
  descriptionHtml?: string | null;
  changelog?: string | null;
  rating?: number | null;
  status?: GameStatus;
  updatedAt?: string | null;
  extra?: Record<string, unknown>;
}

/** The minimal game shape the host sends back to a plugin. */
export interface GameRef {
  /** the launcher's own id for the game, when it has one */
  id?: number;
  source: string;
  sourceId: string;
  url: string;
  title: string;
  version?: string | null;
  updatedAt?: string | null;
  extra?: Record<string, unknown> | null;
}

export interface Ref {
  kind: 'game' | 'listing';
  id: string;
  url: string;
}

export interface FileCandidate {
  /** stable within a game: host + path hash is fine */
  id: string;
  label: string;
  url: string;
  filename?: string | null;
  size?: number | null;
  host?: string | null;
  kind: FileKind;
  platform?: Platform;
  /** true when the URL is only reachable with the source session or key */
  requiresAuth?: boolean;
  /** true = range requests work, false = they do not, undefined or null = probe */
  rangeHint?: boolean | null;
  /** extra request headers the downloader must send */
  headers?: Record<string, string>;
}

export interface UpdateInfo {
  version?: string | null;
  updatedAt?: string | null;
  changelog?: string | null;
}

export interface ProviderCapabilities {
  browse: boolean;
  auth: AuthKind;
  updateCheck: boolean;
  resolveFiles: boolean;
  /** version strings are meaningful, not just file times */
  versioned: boolean;
  /** true when the source implements source.listGames. Missing means false. */
  listGames?: boolean;
}

export interface AuthState {
  status: AuthStatus;
  user?: string | null;
  message?: string | null;
  checkedAt?: string | null;
}
