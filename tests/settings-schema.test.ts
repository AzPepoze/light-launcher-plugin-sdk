import { describe, expect, test } from 'bun:test';
import { settingsSchemaProblems } from '../src/schema/settings';

const stringField = { type: 'string', title: 'Text', default: 'x' };

function settingsSchema(properties: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return { type: 'object', additionalProperties: false, properties, ...extra };
}

interface Case {
  name: string;
  schema: unknown;
  valid: boolean;
  path?: string;
  text?: string;
}

const cases: Case[] = [
  {
    name: 'accepts the supported keywords and extensions',
    schema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      title: 'Demo settings',
      additionalProperties: false,
      required: ['name'],
      properties: {
        name: { ...stringField, minLength: 1, maxLength: 20, examples: ['demo'], 'x-ll-group': 'Site' },
        count: { type: 'integer', title: 'Count', default: 1, minimum: 0, maximum: 10 },
        ratio: { type: 'number', title: 'Ratio', default: 0.5 },
        enabled: { type: 'boolean', title: 'Enabled', default: true, 'x-ll-advanced': true },
        mode: { type: 'string', title: 'Mode', default: 'a', enum: ['a', 'b'] },
        folder: { type: 'string', title: 'Folder', default: '', 'x-ll-widget': 'folder' },
        files: { type: 'array', title: 'Files', default: [], items: { type: 'string' }, minItems: 0, maxItems: 5, uniqueItems: true },
        tags: { type: 'array', title: 'Tags', default: [], items: { enum: ['a', 'b'] } },
      },
    },
    valid: true,
  },
  { name: 'needs a default on every property', schema: settingsSchema({ a: { type: 'string', title: 'A' } }), valid: false, path: '/properties/a', text: 'default' },
  { name: 'needs a title on every property', schema: settingsSchema({ a: { type: 'string', default: 'x' } }), valid: false, path: '/properties/a', text: 'title' },
  { name: 'refuses pattern', schema: settingsSchema({ a: { ...stringField, pattern: '^x$' } }), valid: false, text: '"pattern"' },
  { name: 'refuses a nested object', schema: settingsSchema({ a: { type: 'object', title: 'A', default: {} } }), valid: false, path: '/properties/a/type' },
  { name: 'refuses definitions', schema: { ...settingsSchema({}), definitions: {} }, valid: false, text: '"definitions"' },
  { name: 'refuses an unknown widget', schema: settingsSchema({ a: { ...stringField, 'x-ll-widget': 'picker' } }), valid: false, path: '/properties/a/x-ll-widget' },
  {
    name: 'refuses a folder widget on a number',
    schema: settingsSchema({ a: { type: 'number', title: 'A', default: 1, 'x-ll-widget': 'folder' } }),
    valid: false,
    path: '/properties/a/type',
  },
  { name: 'refuses a false advanced flag', schema: settingsSchema({ a: { ...stringField, 'x-ll-advanced': false } }), valid: false, path: '/properties/a/x-ll-advanced' },
  { name: 'refuses a numeric group', schema: settingsSchema({ a: { ...stringField, 'x-ll-group': 3 } }), valid: false, path: '/properties/a/x-ll-group' },
  { name: 'needs items on an array', schema: settingsSchema({ a: { type: 'array', title: 'A', default: [] } }), valid: false, path: '/properties/a', text: 'items' },
  {
    name: 'accepts a string type and an enum together on array items',
    schema: settingsSchema({ a: { type: 'array', title: 'A', default: [], items: { type: 'string', enum: ['a'] } } }),
    valid: true,
  },
  { name: 'refuses empty items on an array', schema: settingsSchema({ a: { type: 'array', title: 'A', default: [], items: {} } }), valid: false, path: '/properties/a/items' },
  { name: 'refuses items on a string', schema: settingsSchema({ a: { ...stringField, items: { type: 'string' } } }), valid: false, path: '/properties/a/type' },
  { name: 'accepts an object with an empty properties map', schema: { type: 'object', properties: {} }, valid: true },
  { name: 'refuses a non-object top level', schema: { type: 'string', properties: {} }, valid: false },
  { name: 'refuses a top level with no properties', schema: { type: 'object' }, valid: false },
  { name: 'refuses additionalProperties true', schema: settingsSchema({}, { additionalProperties: true }), valid: false },
  { name: 'refuses a schema Ajv cannot compile', schema: { ...settingsSchema({}), $schema: 'not-a-schema' }, valid: false, text: 'not a valid JSON Schema' },
];

describe('settings schema validator', () => {
  test.each(cases)('$name', ({ schema, valid, path, text }) => {
    const problems = settingsSchemaProblems(schema);
    if (valid) {
      expect(problems).toEqual([]);
      return;
    }
    expect(problems.length).toBeGreaterThan(0);
    expect(
      problems.some((problem) => (!path || problem.startsWith(path)) && (!text || problem.includes(text))),
      `${path ?? ''} ${text ?? ''}`,
    ).toBe(true);
  });
});
