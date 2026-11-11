import type { DownloadRoot } from './methods';

/** The download choices a plugin offers the user in its settings. */
export interface DownloadSettings {
  downloadRoot: DownloadRoot;
  gameSubfolder: boolean;
  installAfterDownload: boolean;
  deleteArchiveAfterInstall: boolean;
}
