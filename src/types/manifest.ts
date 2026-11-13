/** Shape of plugin.json. Matches schema/plugin.schema.json. */

export type PluginHook = 'onGameLaunch' | 'onGameExit' | 'onGameInstalled';
/**
 * "sync:games" means source.sync returns GameDTO[].
 * "sync:index" means source.sync returns a SyncStatus. Declare at most one.
 */
export type SourceCapability =
  | 'browse'
  | 'browse:filters'
  | 'auth'
  | 'updateCheck'
  | 'resolveFiles'
  | 'sync:games'
  | 'sync:index'
  | 'listGames';
/** Older card shape in the library: poster (3:4, the default), wide (16:9) or square (1:1). Use cover instead. */
export type Tile = 'poster' | 'wide' | 'square';
/** Card box as "W:H", such as "4:3". Sides are 1 to 32 and width to height is 0.25 to 4. */
export interface SourceCover {
  ratio: string;
}
/** A button in the library sidebar (library) or in the game detail (game). */
export interface SourceAction {
  id: string;
  label: string;
  /** Material icon name, such as sync */
  icon?: string;
  /** plugin method the launcher calls, such as demo-site.sync */
  method: string;
  /** Default library */
  scope?: 'library' | 'game';
}
/** Game fields a card can show as its title or subtitle. */
export type CardField = 'sourceId' | 'title' | 'version' | 'developer' | 'engine' | 'status' | 'updatedAt';
export type CardBadge = 'favorite' | 'updateAvailable' | 'installed';
/** Which game fields a card shows. Missing fields use title and version, with no badges. */
export interface SourceCard {
  title?: CardField;
  subtitle?: CardField;
  badges?: CardBadge[];
}
export type EntryKey = `${'linux' | 'windows' | 'mac'}-${'x64' | 'arm64'}`;

export interface SidebarOption {
  value: string;
  label: string;
}

export interface SidebarSearch {
  type: 'search';
  id: string;
  placeholder?: string;
}

export interface SidebarToggleOption extends SidebarOption {
  icon?: string;
}

export interface SidebarToggles {
  type: 'toggles';
  id: string;
  options: SidebarToggleOption[];
}

interface SidebarSelectBase {
  type: 'select';
  id: string;
  label: string;
}

/** Either fixed options, or dynamic: true to load them with source.listFilters. */
export type SidebarSelect =
  | (SidebarSelectBase & { options: SidebarOption[]; dynamic?: never })
  | (SidebarSelectBase & { dynamic: true; options?: never });

export interface SidebarMulti {
  type: 'multi';
  id: string;
  label: string;
  dynamic: true;
  searchable?: boolean;
}

export interface SidebarSort {
  type: 'sort';
  id: string;
  options: SidebarOption[];
  orderable?: boolean;
  /** Its value must be one of the options. */
  default?: { value: string; order: 'asc' | 'desc' };
}

/** One group in a source sidebar. The type decides the control the launcher shows. */
export type SidebarGroup = SidebarSearch | SidebarToggles | SidebarSelect | SidebarMulti | SidebarSort;

export interface SourceContribution {
  id: string;
  label: string;
  /** Older card shape. Missing means poster. cover wins when both are set. */
  tile?: Tile;
  cover?: SourceCover;
  /** At most 8 buttons, with unique ids. */
  actions?: SourceAction[];
  card?: SourceCard;
  /** Filters beside the list. Needs the browse:filters capability. */
  sidebar?: SidebarGroup[];
  capabilities: SourceCapability[];
}

export interface PageContribution {
  id: string;
  title: string;
  /** path inside the package, such as ui/index.html */
  path: string;
}

export interface NamedContribution {
  id: string;
  label: string;
}

export interface CommandContribution extends NamedContribution {
  /** plugin method that runs the command, such as demo.importKey */
  method?: string;
}

export interface Contributes {
  sources?: SourceContribution[];
  settings?: { $ref: string };
  commands?: CommandContribution[];
}

/** A folder the host maps: $GAMES, $DOWNLOADS, $DATA, or $APPDATA_<NAME>. */
export type FsName = '$GAMES' | '$DOWNLOADS' | '$DATA' | `$APPDATA_${string}`;

export interface PluginPermissions {
  /** host names, or *.host to allow subdomains */
  network?: string[];
  /** named folders the host grants, such as $GAMES */
  fs?: FsName[];
  secrets?: boolean;
  browser?: boolean;
  exec?: boolean;
}

export interface PluginManifest {
  id: string;
  name: string;
  author?: string;
  description?: string;
  /** http or https URL */
  homepage?: string;
  /** GitHub repository for the planned updater, such as github:owner/repo */
  repository?: string;
  /** semver */
  version: string;
  /** major protocol version the plugin targets */
  apiVersion: string;
  /** semver of the oldest host that can run this plugin */
  minHost: string;
  entry: Partial<Record<EntryKey, string>>;
  contributes: Contributes;
  permissions: PluginPermissions;
}
