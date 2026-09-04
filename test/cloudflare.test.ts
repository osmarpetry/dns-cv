import { test } from 'node:test';
import assert from 'node:assert/strict';

import { toRecordContent } from '../src/cloudflare.ts';

test('quotes every string so Cloudflare stores a multi-string TXT record', () => {
  assert.equal(toRecordContent(['first', 'second']), '"first" "second"');
});

test('quotes a single string too', () => {
  assert.equal(toRecordContent(['only']), '"only"');
});

test('doubles a backslash so DNS presentation format keeps it', () => {
  // `\n` in presentation format means the literal character `n`; the record has
  // to carry `\\n` for a resolver to hand back the two characters `\` and `n`.
  assert.equal(toRecordContent(['line\\none']), '"line\\\\none"');
});

test('escapes every backslash in a multi-string record', () => {
  assert.equal(toRecordContent(['a\\nb', 'c\\nd']), '"a\\\\nb" "c\\\\nd"');
});
