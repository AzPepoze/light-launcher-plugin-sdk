import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeDump } from '../src/helpers';

let workdir: string;

beforeEach(() => {
  workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'llp-dump-'));
});

afterEach(() => {
  fs.rmSync(workdir, { recursive: true, force: true });
});

describe('writeDump', () => {
  test('writes a sanitised file name and creates the folder', () => {
    writeDump(workdir, 'game page/../x', '<html>body</html>');
    expect(fs.readFileSync(path.join(workdir, 'game_page_.._x.html'), 'utf8')).toBe('<html>body</html>');
  });

  test('does nothing when the folder is empty', () => {
    expect(() => writeDump('', 'page', 'body')).not.toThrow();
  });
});
