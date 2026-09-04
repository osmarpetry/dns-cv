import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compareRecords, isNotPublished } from '../src/verify.ts';

const built = [
  { host: 'cv.osmarpetry.dev', strings: ['first', 'second'] },
  { host: 'contact.cv.osmarpetry.dev', strings: ['only'] },
];

test('reports no drift when every host serves what was built', () => {
  const live = new Map([
    ['cv.osmarpetry.dev', [['first', 'second']]],
    ['contact.cv.osmarpetry.dev', [['only']]],
  ]);
  assert.deepEqual(compareRecords(built, live), []);
});

test('compares the joined value, so a resolver splitting the chunks differently still matches', () => {
  const live = new Map([
    ['cv.osmarpetry.dev', [['fir', 'st', 'second']]],
    ['contact.cv.osmarpetry.dev', [['only']]],
  ]);
  assert.deepEqual(compareRecords(built, live), []);
});

test('flags a host that answers nothing as not published', () => {
  const live = new Map([['contact.cv.osmarpetry.dev', [['only']]]]);
  const drift = compareRecords(built, live);
  assert.equal(drift.length, 1);
  assert.equal(drift[0]!.host, 'cv.osmarpetry.dev');
  assert.match(drift[0]!.reason, /no TXT record/);
});

test('flags a host answering an empty record set as not published', () => {
  const live = new Map([
    ['cv.osmarpetry.dev', []],
    ['contact.cv.osmarpetry.dev', [['only']]],
  ]);
  assert.match(compareRecords(built, live)[0]!.reason, /no TXT record/);
});

test('flags stale content and blames the cache, not the publish', () => {
  const live = new Map([
    ['cv.osmarpetry.dev', [['first', 'OLD']]],
    ['contact.cv.osmarpetry.dev', [['only']]],
  ]);
  const drift = compareRecords(built, live);
  assert.equal(drift.length, 1);
  assert.match(drift[0]!.reason, /still serving different content/);
});

test('picks the dns-cv record when the host also carries an unrelated TXT record', () => {
  const live = new Map([
    ['cv.osmarpetry.dev', [['v=spf1 -all'], ['first', 'second']]],
    ['contact.cv.osmarpetry.dev', [['only']]],
  ]);
  assert.deepEqual(compareRecords(built, live), []);
});

test('treats a name that does not resolve as simply not published yet', () => {
  assert.equal(isNotPublished(Object.assign(new Error('x'), { code: 'ENOTFOUND' })), true);
  assert.equal(isNotPublished(Object.assign(new Error('x'), { code: 'ENODATA' })), true);
});

test('does not mistake a broken network for an unpublished record', () => {
  assert.equal(isNotPublished(Object.assign(new Error('x'), { code: 'ETIMEOUT' })), false);
  assert.equal(isNotPublished(new Error('boom')), false);
});
