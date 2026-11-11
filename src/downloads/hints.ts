import type { DownloadSettings } from '../types/downloads';
import type { PrepareDownloadResult } from '../types/methods';

export type DownloadHints = Pick<
  PrepareDownloadResult,
  'root' | 'subfolder' | 'install' | 'installSubfolder' | 'deleteArchive'
>;

export const DOWNLOAD_SETTINGS_DEFAULTS: DownloadSettings = {
  downloadRoot: 'downloads',
  gameSubfolder: true,
  installAfterDownload: false,
  deleteArchiveAfterInstall: false,
};

const FALLBACK_FOLDER_NAME = 'game';
// The launcher accepts a folder name up to 255 UTF-8 bytes. 200 leaves room for the added "_".
const MAX_FOLDER_NAME_BYTES = 200;
const utf8 = new TextEncoder();
// Characters that Windows forbids in names, plus control characters.
const FORBIDDEN_CHARS = /[<>:"|?*\/\\\u0000-\u001f\u007f-\u009f]/g;
const RESERVED_BASE_NAME = /^(CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])$/i;

function collapseSpaces(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function trimDotsAndSpaces(text: string): string {
  return text.replace(/^[. ]+|[. ]+$/g, '');
}

/** Removes forbidden characters. Spaces are turned into single spaces first, so tabs and new lines become word breaks. */
function removeForbiddenChars(title: string): string {
  return collapseSpaces(collapseSpaces(title).replace(FORBIDDEN_CHARS, ''));
}

/** Keeps whole characters until the name would pass the byte limit. */
function capBytes(name: string): string {
  let kept = '';
  let bytes = 0;
  for (const character of name) {
    bytes += utf8.encode(character).length;
    if (bytes > MAX_FOLDER_NAME_BYTES) break;
    kept += character;
  }
  return trimDotsAndSpaces(kept);
}

/** Adds an underscore after a Windows device name, such as "CON" or "nul.txt". */
function protectReservedName(name: string): string {
  const dot = name.indexOf('.');
  const base = dot === -1 ? name : name.slice(0, dot);
  const rest = name.slice(base.length);
  return RESERVED_BASE_NAME.test(base.trimEnd()) ? `${base.trimEnd()}_${rest}` : name;
}

/** Turns a game title into one folder name that works on Windows and Linux. */
export function sanitizeFolderName(title: string): string {
  const name = capBytes(trimDotsAndSpaces(removeForbiddenChars(title)));
  if (!name) return FALLBACK_FOLDER_NAME;
  return protectReservedName(name);
}

/** Maps the user's download settings to the folder and install fields of a download. */
export function downloadHints(settings: DownloadSettings, game: { title: string }): DownloadHints {
  const subfolder = settings.gameSubfolder ? sanitizeFolderName(game.title) : undefined;
  const hints: DownloadHints = { root: settings.downloadRoot };
  if (subfolder !== undefined) hints.subfolder = subfolder;
  if (!settings.installAfterDownload) return hints;

  hints.install = true;
  hints.deleteArchive = settings.deleteArchiveAfterInstall;
  if (subfolder !== undefined) hints.installSubfolder = subfolder;
  return hints;
}

const DOWNLOADS_GROUP = 'Downloads';

/** Schema properties for the four download settings. Spread them into a plugin's settings schema. */
export const downloadSettingsSchemaProperties: Record<string, Record<string, unknown>> = {
  downloadRoot: {
    type: 'string',
    title: 'Download folder',
    description: 'Save downloads in the downloads folder, or in the games folder.',
    enum: ['downloads', 'games'],
    default: DOWNLOAD_SETTINGS_DEFAULTS.downloadRoot,
    'x-ll-group': DOWNLOADS_GROUP,
  },
  gameSubfolder: {
    type: 'boolean',
    title: 'Folder for each game',
    description: "Put each game's files in a folder named after the game.",
    default: DOWNLOAD_SETTINGS_DEFAULTS.gameSubfolder,
    'x-ll-group': DOWNLOADS_GROUP,
  },
  installAfterDownload: {
    type: 'boolean',
    title: 'Install after download',
    description: 'Unpack the archive into the games folder when the download finishes.',
    default: DOWNLOAD_SETTINGS_DEFAULTS.installAfterDownload,
    'x-ll-group': DOWNLOADS_GROUP,
  },
  deleteArchiveAfterInstall: {
    type: 'boolean',
    title: 'Delete the archive after install',
    description: 'Remove the downloaded archive after a successful install.',
    default: DOWNLOAD_SETTINGS_DEFAULTS.deleteArchiveAfterInstall,
    'x-ll-group': DOWNLOADS_GROUP,
    'x-ll-advanced': true,
  },
};
