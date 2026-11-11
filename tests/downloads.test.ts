import { describe, expect, test } from 'bun:test';
import * as sdk from '../src';
import {
  DOWNLOAD_SETTINGS_DEFAULTS,
  downloadHints,
  downloadSettingsSchemaProperties,
  sanitizeFolderName,
} from '../src/downloads/hints';
import { settingsSchemaProblems } from '../src/schema/settings';
import type { DownloadSettings } from '../src/types/downloads';

describe('sanitizeFolderName', () => {
  test.each([
    ['..', 'game'],
    ['a/b', 'ab'],
    ['a\\b', 'ab'],
    ['CON', 'CON_'],
    ['con.txt', 'con_.txt'],
    ['COM1', 'COM1_'],
    ['Nul', 'Nul_'],
    ['nul.txt', 'nul_.txt'],
    ['LPT9.log', 'LPT9_.log'],
    ['AUX ', 'AUX_'],
    ['CON .txt', 'CON_.txt'],
    ['COM¹', 'COM¹_'],
    ['lpt².txt', 'lpt²_.txt'],
    ['COM10', 'COM10'],
    ['CONSOLE', 'CONSOLE'],
    ['game.', 'game'],
    [' .hidden', 'hidden'],
    ['😀 Fun *Game*?', '😀 Fun Game'],
    ['<>:"|?*', 'game'],
    ['/\\', 'game'],
    ['', 'game'],
    ['   ', 'game'],
    ['a\tb\nc\r\nd', 'a b c d'],
    [' \t Hades \n\r II \v ', 'Hades II'],
    ['a\u0000b\u007fc\u0085d', 'abcd'],
    ['Hades II', 'Hades II'],
  ])('%j becomes %j', (title, expected) => {
    expect(sanitizeFolderName(title)).toBe(expected);
  });

  test('caps the name at 200 bytes', () => {
    const long = sanitizeFolderName('a'.repeat(300));
    expect(long).toBe('a'.repeat(200));
  });

  test('counts bytes, so emoji never push the name past the launcher limit', () => {
    const name = sanitizeFolderName('😀'.repeat(100));
    expect(name).toBe('😀'.repeat(50));
    expect(new TextEncoder().encode(name).length).toBeLessThanOrEqual(255);
  });

  test('a reserved name with the cap still fits the launcher limit', () => {
    const name = sanitizeFolderName(`CON.${'x'.repeat(300)}`);
    expect(new TextEncoder().encode(name).length).toBeLessThanOrEqual(255);
  });

  test('trims dots and spaces again after the cap', () => {
    expect(sanitizeFolderName(`${'a'.repeat(199)} b`)).toBe('a'.repeat(199));
  });
});

describe('downloadHints', () => {
  const game = { title: 'Hades II' };
  const settings = (overrides: Partial<DownloadSettings>): DownloadSettings => ({
    ...DOWNLOAD_SETTINGS_DEFAULTS,
    ...overrides,
  });

  test.each<[string, DownloadSettings, object]>([
    ['downloads, subfolder, no install', settings({ downloadRoot: 'downloads', gameSubfolder: true }), { root: 'downloads', subfolder: 'Hades II' }],
    ['downloads, subfolder, delete ignored without install', settings({ downloadRoot: 'downloads', gameSubfolder: true, deleteArchiveAfterInstall: true }), { root: 'downloads', subfolder: 'Hades II' }],
    ['downloads, no subfolder, no install', settings({ downloadRoot: 'downloads', gameSubfolder: false }), { root: 'downloads' }],
    ['downloads, no subfolder, delete ignored without install', settings({ downloadRoot: 'downloads', gameSubfolder: false, deleteArchiveAfterInstall: true }), { root: 'downloads' }],
    ['downloads, subfolder, install, keep archive', settings({ downloadRoot: 'downloads', gameSubfolder: true, installAfterDownload: true }), { root: 'downloads', subfolder: 'Hades II', install: true, installSubfolder: 'Hades II', deleteArchive: false }],
    ['downloads, subfolder, install, delete archive', settings({ downloadRoot: 'downloads', gameSubfolder: true, installAfterDownload: true, deleteArchiveAfterInstall: true }), { root: 'downloads', subfolder: 'Hades II', install: true, installSubfolder: 'Hades II', deleteArchive: true }],
    ['downloads, no subfolder, install, keep archive', settings({ downloadRoot: 'downloads', gameSubfolder: false, installAfterDownload: true }), { root: 'downloads', install: true, deleteArchive: false }],
    ['downloads, no subfolder, install, delete archive', settings({ downloadRoot: 'downloads', gameSubfolder: false, installAfterDownload: true, deleteArchiveAfterInstall: true }), { root: 'downloads', install: true, deleteArchive: true }],
    ['games, subfolder, no install', settings({ downloadRoot: 'games', gameSubfolder: true }), { root: 'games', subfolder: 'Hades II' }],
    ['games, subfolder, delete ignored without install', settings({ downloadRoot: 'games', gameSubfolder: true, deleteArchiveAfterInstall: true }), { root: 'games', subfolder: 'Hades II' }],
    ['games, no subfolder, no install', settings({ downloadRoot: 'games', gameSubfolder: false }), { root: 'games' }],
    ['games, no subfolder, delete ignored without install', settings({ downloadRoot: 'games', gameSubfolder: false, deleteArchiveAfterInstall: true }), { root: 'games' }],
    ['games, subfolder, install, keep archive', settings({ downloadRoot: 'games', gameSubfolder: true, installAfterDownload: true }), { root: 'games', subfolder: 'Hades II', install: true, installSubfolder: 'Hades II', deleteArchive: false }],
    ['games, subfolder, install, delete archive', settings({ downloadRoot: 'games', gameSubfolder: true, installAfterDownload: true, deleteArchiveAfterInstall: true }), { root: 'games', subfolder: 'Hades II', install: true, installSubfolder: 'Hades II', deleteArchive: true }],
    ['games, no subfolder, install, keep archive', settings({ downloadRoot: 'games', gameSubfolder: false, installAfterDownload: true }), { root: 'games', install: true, deleteArchive: false }],
    ['games, no subfolder, install, delete archive', settings({ downloadRoot: 'games', gameSubfolder: false, installAfterDownload: true, deleteArchiveAfterInstall: true }), { root: 'games', install: true, deleteArchive: true }],
  ])('%s', (_name, value, expected) => {
    expect(downloadHints(value, game)).toStrictEqual(expected);
  });

  test('uses the sanitized title for both folders', () => {
    const hints = downloadHints(settings({ installAfterDownload: true }), { title: 'Dead/Cells?' });
    expect(hints.subfolder).toBe('DeadCells');
    expect(hints.installSubfolder).toBe('DeadCells');
  });
});

describe('downloadSettingsSchemaProperties', () => {
  const wrapper = (properties: Record<string, unknown>) => ({
    type: 'object',
    title: 'Demo',
    properties,
    required: ['downloadRoot'],
    additionalProperties: false,
  });

  test('validates inside a wrapper schema with the SDK settings validator', () => {
    const plugin = wrapper({
      ...downloadSettingsSchemaProperties,
      folder: { type: 'string', title: 'Folder', default: '', 'x-ll-widget': 'folder' },
    });
    expect(settingsSchemaProblems(plugin)).toEqual([]);
  });

  test('its defaults match DOWNLOAD_SETTINGS_DEFAULTS', () => {
    for (const [key, field] of Object.entries(downloadSettingsSchemaProperties)) {
      expect(field.default).toBe(DOWNLOAD_SETTINGS_DEFAULTS[key as keyof DownloadSettings]);
    }
  });

  test('puts every setting in the Downloads group and hides the archive option', () => {
    for (const field of Object.values(downloadSettingsSchemaProperties)) {
      expect(field['x-ll-group']).toBe('Downloads');
    }
    expect(downloadSettingsSchemaProperties.deleteArchiveAfterInstall['x-ll-advanced']).toBe(true);
  });

  test('a broken field next to the fragment is still reported', () => {
    const problems = settingsSchemaProblems(
      wrapper({ ...downloadSettingsSchemaProperties, broken: { type: 'boolean', title: 'Broken' } }),
    );
    expect(problems.some((p) => p.startsWith('/properties/broken') && p.includes('default'))).toBe(true);
  });
});

describe('package exports', () => {
  test('the entry point exports the download helpers', () => {
    expect(sdk.sanitizeFolderName).toBe(sanitizeFolderName);
    expect(sdk.downloadHints).toBe(downloadHints);
    expect(sdk.DOWNLOAD_SETTINGS_DEFAULTS).toBe(DOWNLOAD_SETTINGS_DEFAULTS);
    expect(sdk.downloadSettingsSchemaProperties).toBe(downloadSettingsSchemaProperties);
  });
});
