import { test } from 'node:test';
import assert from 'node:assert/strict';

import { assertOnlyColorMarkers, expandMarkers, markupLine } from '../src/sgr.ts';

const ESC = String.fromCharCode(27);

test('marks a heading with a colour code written as text, not as a control byte', () => {
  const marked = markupLine('# Osmar Petry');
  assert.equal(marked, '\\033[1;36mOsmar Petry\\033[0m');
  assert.ok(!marked.includes(ESC), 'the record must never carry a real escape byte');
});

test('marks a command line, a bullet and a label', () => {
  assert.equal(markupLine('$ dig +short TXT cv.osmarpetry.dev'),
    '\\033[32m$ dig +short TXT cv.osmarpetry.dev\\033[0m');
  assert.equal(markupLine('- dns-cv'), '\\033[33m-\\033[0m dns-cv');
  assert.equal(markupLine('Email: a@b.c'), '\\033[1mEmail:\\033[0m a@b.c');
});

test('leaves an ordinary line untouched, so most of the budget stays content', () => {
  assert.equal(markupLine('Luxembourg, LU'), 'Luxembourg, LU');
});

test('expands the markers into real escapes when colour is on', () => {
  assert.equal(expandMarkers('\\033[1;36mTitle\\033[0m', { color: true }),
    `${ESC}[1;36mTitle${ESC}[0m`);
});

test('removes the markers entirely when colour is off', () => {
  assert.equal(expandMarkers('\\033[1;36mTitle\\033[0m', { color: false }), 'Title');
});

test('accepts a value whose only backslash sequences are newlines and colours', () => {
  assert.doesNotThrow(() => assertOnlyColorMarkers('\\033[1mA\\033[0m\\nplain'));
});

test('rejects a hyperlink sequence, which could point anywhere', () => {
  assert.throws(() => assertOnlyColorMarkers('\\033]8;;http://evil\\aclick'), /\\033\]/);
});

test('rejects cursor movement and screen clearing, which can hide or fake output', () => {
  assert.throws(() => assertOnlyColorMarkers('\\033[2J'), /only colour/);
  assert.throws(() => assertOnlyColorMarkers('\\033[10A'), /only colour/);
});

test('rejects a stray backslash that is neither a newline nor a colour', () => {
  assert.throws(() => assertOnlyColorMarkers('a\\tb'), /only colour/);
});
