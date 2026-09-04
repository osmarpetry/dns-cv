import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildRecord, chunkUtf8, MAX_STRING_BYTES, toDnsValue } from '../src/txt.ts';

const byteLength = (value: string) => Buffer.byteLength(value, 'utf8');

test('keeps a short value as a single string', () => {
  assert.deepEqual(chunkUtf8('hello'), ['hello']);
});

test('splits a value longer than 255 bytes into 255-byte strings', () => {
  const value = 'a'.repeat(600);

  const chunks = chunkUtf8(value);

  assert.deepEqual(chunks.map(byteLength), [255, 255, 90]);
  assert.equal(chunks.join(''), value);
});

test('never splits a multi-byte UTF-8 character across strings', () => {
  // 'é' is 2 bytes: a naive 255-byte cut would land mid-character.
  const value = 'x'.repeat(254) + 'é'.repeat(10);

  const chunks = chunkUtf8(value);

  for (const chunk of chunks) {
    assert.ok(byteLength(chunk) <= MAX_STRING_BYTES);
    assert.ok(!chunk.includes('�'));
  }
  assert.equal(chunks[0], 'x'.repeat(254));
  assert.equal(chunks.join(''), value);
});

test('accepts a smaller limit', () => {
  assert.deepEqual(chunkUtf8('abcdef', 2), ['ab', 'cd', 'ef']);
});

test('encodes line breaks as literal backslash-n', () => {
  assert.equal(toDnsValue('first\nsecond'), 'first\\nsecond');
});

test('normalizes CRLF and trailing blank lines', () => {
  assert.equal(toDnsValue('first\r\nsecond   \n\n\n'), 'first\\nsecond');
});

test('rejects characters that DNS presentation format has to escape', () => {
  assert.throws(() => toDnsValue('say "hi"'), /quote/i);
  assert.throws(() => toDnsValue('C:\\path'), /backslash/i);
});

test('rejects non-ASCII so every resolver renders the same bytes', () => {
  assert.throws(() => toDnsValue('Osmar Petry — Luxembourg'), /non-ASCII/i);
});

test('rejects control characters such as ANSI escapes', () => {
  assert.throws(() => toDnsValue('\u001b[31mred'), /control/i);
});

test('builds a record whose strings each fit the 255-byte limit', () => {
  const record = buildRecord('home', 'line one\nline two');

  assert.equal(record.name, 'home');
  assert.deepEqual(record.strings, ['line one\\nline two']);
  assert.equal(record.bytes, 'line one\\nline two'.length);
});

test('splits a long section across strings while reporting the total size', () => {
  const record = buildRecord('experience', 'x'.repeat(600));

  assert.equal(record.strings.length, 3);
  assert.equal(record.bytes, 600);
});

test('rejects a section larger than the configured record budget', () => {
  assert.throws(() => buildRecord('projects', 'x'.repeat(300), 256), /projects.*300.*256/s);
});

test('represents empty content as one empty string, never zero strings', () => {
  assert.deepEqual(chunkUtf8(''), ['']);
});

test('carries colour as markers so a one-line reader can print it', () => {
  const value = toDnsValue('# Title\n\nplain line');
  assert.equal(value, '\\033[1;36mTitle\\033[0m\\n\\nplain line');
});
