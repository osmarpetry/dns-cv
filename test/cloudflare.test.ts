import { test } from 'node:test';
import assert from 'node:assert/strict';

import { toRecordContent } from '../src/cloudflare.ts';

test('quotes every string so Cloudflare stores a multi-string TXT record', () => {
  assert.equal(toRecordContent(['first', 'second']), '"first" "second"');
});

test('quotes a single string too', () => {
  assert.equal(toRecordContent(['only']), '"only"');
});
