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
/** Card shape in the library: poster (3:4, the default), wide (16:9) or square (1:1). */
export type Tile = 'poster' | 'wide' | 'square';
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
  /** Card shape in the library. Missing means poster. */
  tile?: Tile;
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

export interface ThemeContribution {
  id: string;
  label: string;
  path: string;
}

export interface Contributes {
  sources?: SourceContribution[];
  settings?: { $ref: string };
  pages?: PageContribution[];
  commands?: CommandContribution[];
  hooks?: PluginHook[];
  launchAdapters?: NamedContribution[];
  importers?: NamedContribution[];
  themes?: ThemeContribution[];
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
