import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { PluginManifest } from '../../types/manifest';
import type { Logger } from '../log';
import { MANIFEST_FILE, readManifest } from '../manifest';
import { writeZip, type ZipEntry } from '../zip';

export const CHECKSUM_FILE = 'SHA256SUMS';
/** Files that go into the package when they exist, besides the declared ones. */
const OPTIONAL_FILES = ['icon.png', 'README.md', 'LICENSE'];
/** Folders packed in full. */
const FOLDERS = ['bin', 'ui'];
const EXECUTABLE_MODE = 0o755;
const FILE_MODE = 0o644;

export interface PackPlan {
  files: string[];
  missing: string[];
}

/** The files a package holds: plugin.json, declared paths, optional files and bin/ui folders. */
export function planPackage(dir: string, manifest: PluginManifest): PackPlan {
  const declared = declaredFiles(manifest);
  const exists = (rel: string) => fs.existsSync(path.join(dir, rel));
  const missing = declared.filter((rel) => !exists(rel));
  const optional = OPTIONAL_FILES.filter(exists);
  const folders = FOLDERS.filter(exists).flatMap((folder) => filesUnder(dir, folder));
  const files = [...new Set([MANIFEST_FILE, ...declared, ...optional, ...folders])]
    .filter((rel) => rel !== CHECKSUM_FILE && exists(rel))
    .sort();
  return { files, missing };
}

function declaredFiles(manifest: PluginManifest): string[] {
  const { contributes } = manifest;
  return [
    ...Object.values(manifest.entry),
    contributes.settings?.$ref,
    ...(contributes.pages ?? []).map((page) => page.path),
    ...(contributes.themes ?? []).map((theme) => theme.path),
  ].filter((rel): rel is string => Boolean(rel));
}

function filesUnder(dir: string, folder: string): string[] {
  const names = fs.readdirSync(path.join(dir, folder), { recursive: true }) as string[];
  return names
    .filter((name) => fs.statSync(path.join(dir, folder, name)).isFile())
    .map((name) => `${folder}/${name.split(path.sep).join('/')}`);
}

export function sha256Hex(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Lines in the sha256sum format: "<hash>  <path>". */
export function checksumLines(entries: ZipEntry[]): string {
  return entries.map((entry) => `${sha256Hex(entry.data)}  ${entry.name}\n`).join('');
}

/** Builds <outDir>/<id>-<version>.llplugin. Returns the exit code. */
export function packCommand(dir: string, outDir: string, log: Logger): number {
  const read = readManifest(dir);
  if (!read.ok) {
    for (const problem of read.problems) log.error(problem);
    return 1;
  }
  const { manifest } = read;
  const plan = planPackage(dir, manifest);
  if (plan.missing.length) {
    for (const rel of plan.missing) log.error(`declared file is missing: ${rel}`);
    return 1;
  }

  const executables = new Set(Object.values(manifest.entry));
  const entries: ZipEntry[] = plan.files.map((rel) => ({
    name: rel,
    data: fs.readFileSync(path.join(dir, rel)),
    mode: executables.has(rel) ? EXECUTABLE_MODE : FILE_MODE,
  }));
  entries.push({ name: CHECKSUM_FILE, data: new TextEncoder().encode(checksumLines(entries)), mode: FILE_MODE });

  log.warn('package is unsigned: the host will show an unsigned warning on install');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${manifest.id}-${manifest.version}.llplugin`);
  fs.writeFileSync(out, writeZip(entries));
  for (const entry of entries) log.info(`packed ${entry.name}`);
  log.info(`wrote ${out} (${entries.length} files)`);
  return 0;
}
