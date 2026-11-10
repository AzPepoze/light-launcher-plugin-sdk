/** Shape of plugin.json. Matches schema/plugin.schema.json. */

export type PluginHook = 'onGameLaunch' | 'onGameExit' | 'onGameInstalled';
export type SourceCapability = 'browse' | 'auth' | 'updateCheck' | 'resolveFiles' | 'sync';
export type EntryKey = `${'linux' | 'windows' | 'mac'}-${'x64' | 'arm64'}`;

export interface SourceContribution {
  id: string;
  label: string;
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

export interface ThemeContribution {
  id: string;
  label: string;
  path: string;
}

export interface Contributes {
  sources?: SourceContribution[];
  settings?: { $ref: string };
  pages?: PageContribution[];
  commands?: NamedContribution[];
  hooks?: PluginHook[];
  launchAdapters?: NamedContribution[];
  importers?: NamedContribution[];
  themes?: ThemeContribution[];
}

export interface PluginPermissions {
  /** host names, or *.host to allow subdomains */
  network?: string[];
  /** named folders the host grants, such as $GAMES */
  fs?: string[];
  secrets?: boolean;
  browser?: boolean;
  exec?: boolean;
}

export interface PluginManifest {
  id: string;
  name: string;
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
