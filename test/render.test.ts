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

test('adds no colour of its own: an unmarked record renders plain even with colour on', () => {
  const output = renderSection(['# Osmar Petry'], { color: true });

  assert.equal(output, '# Osmar Petry');
  assert.ok(!output.includes(ESC));
});

test('drops control bytes that arrive from DNS instead of rendering them', () => {
  const output = renderSection([ESC + '[2Jhello'], { color: false });

  assert.ok(!output.includes(ESC));
  assert.ok(output.includes('hello'));
});

test('expands the colour markers that arrive from DNS', () => {
  const esc = String.fromCharCode(27);
  assert.equal(
    renderSection(['\\033[1;36mTitle\\033[0m\\nplain'], { color: true }),
    `${esc}[1;36mTitle${esc}[0m\nplain`,
  );
});

test('drops the colour markers when colour is off', () => {
  assert.equal(renderSection(['\\033[1;36mTitle\\033[0m\\nplain'], { color: false }), 'Title\nplain');
});
