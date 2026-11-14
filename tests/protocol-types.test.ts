import { expect, test } from 'bun:test';
import protocol from '../schema/protocol.schema.json';
import type { HostMethods, PluginMethods } from '../src/types/methods';

type SchemaMethod = keyof typeof protocol.methods;
type CodeMethod = keyof HostMethods | keyof PluginMethods;

/** Compile-time guard: a method in one list but not the other gets a type error here. */
const methodNames: Record<CodeMethod, true> = {
  'initialize': true,
  'shutdown': true,
  'source.search': true,
  'source.fetchGame': true,
  'source.resolveFiles': true,
  'source.prepareDownload': true,
  'source.checkUpdate': true,
  'source.sync': true,
  'source.listGames': true,
  'source.browse': true,
  'source.listFilters': true,
  'source.setCredential': true,
  'source.authStatus': true,
  'source.clearCredential': true,
  'source.parseRef': true,
  'http.request': true,
  'secrets.get': true,
  'secrets.set': true,
  'secrets.delete': true,
  'storage.get': true,
  'storage.set': true,
  'downloads.enqueue': true,
  'extract': true,
  'library.upsert': true,
  'settings.get': true,
  'browser.assist': true,
};

const missingFromCode: Record<Exclude<SchemaMethod, CodeMethod>, never> = {};
const extraInCode: Record<Exclude<CodeMethod, SchemaMethod>, never> = {};

test('every protocol method has a matching type, and every type a protocol method', () => {
  expect(Object.keys(methodNames).sort()).toEqual(Object.keys(protocol.methods).sort());
  expect(missingFromCode).toEqual({});
  expect(extraInCode).toEqual({});
});
