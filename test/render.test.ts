import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderSection } from '../src/render.ts';

const ESC = String.fromCharCode(27);

test('concatenates TXT strings and restores the line breaks', () => {
  const output = renderSection(['first\\nsec', 'ond\\nthird'], { color: false });

  assert.equal(output, 'first\nsecond\nthird');
});

test('emits no escape sequences without colour', () => {
  const output = renderSection(['# Osmar Petry\\n- built things\\nEmail: a@b.c'], { color: false });

  assert.ok(!output.includes(ESC));
  assert.equal(output, '# Osmar Petry\n- built things\nEmail: a@b.c');
});

test('highlights a heading with colour and always resets', () => {
  const output = renderSection(['# Osmar Petry'], { color: true });

  assert.ok(output.startsWith(ESC + '[1;36m'));
  assert.ok(output.endsWith(ESC + '[0m'));
  assert.ok(output.includes('Osmar Petry'));
});

test('drops control bytes that arrive from DNS instead of rendering them', () => {
  const output = renderSection([ESC + '[2Jhello'], { color: false });

  assert.ok(!output.includes(ESC));
  assert.ok(output.includes('hello'));
});
