import { test } from 'node:test';
import assert from 'node:assert/strict';

import { upsertEnv, zoneIdFrom } from '../src/setup.ts';

test('reads the zone id when exactly one zone matches the domain', () => {
  const payload = { result: [{ id: 'abc123', name: 'osmarpetry.dev' }] };
  assert.equal(zoneIdFrom(payload, 'osmarpetry.dev'), 'abc123');
});

test('names the scoping mistake when the token sees no zone', () => {
  const payload = { result: [] };
  assert.throws(
    () => zoneIdFrom(payload, 'osmarpetry.dev'),
    /osmarpetry\.dev[\s\S]*Zone Resources/,
  );
});

test('refuses to guess when more than one zone comes back', () => {
  const payload = { result: [{ id: 'a', name: 'one.dev' }, { id: 'b', name: 'two.dev' }] };
  assert.throws(() => zoneIdFrom(payload, 'osmarpetry.dev'), /2 zones/);
});

test('fills an empty key without touching comments or the other lines', () => {
  const before = [
    '# Zone that hosts the CV records',
    'DNS_CV_DOMAIN=osmarpetry.dev',
    '',
    'CLOUDFLARE_API_TOKEN=secret',
    'CLOUDFLARE_ZONE_ID=',
    'DNS_CV_TTL=3600',
    '',
  ].join('\n');

  const after = upsertEnv(before, 'CLOUDFLARE_ZONE_ID', 'abc123');

  assert.equal(
    after,
    [
      '# Zone that hosts the CV records',
      'DNS_CV_DOMAIN=osmarpetry.dev',
      '',
      'CLOUDFLARE_API_TOKEN=secret',
      'CLOUDFLARE_ZONE_ID=abc123',
      'DNS_CV_TTL=3600',
      '',
    ].join('\n'),
  );
});

test('replaces a key that already holds a stale value', () => {
  const after = upsertEnv('CLOUDFLARE_ZONE_ID=old\n', 'CLOUDFLARE_ZONE_ID', 'new');
  assert.equal(after, 'CLOUDFLARE_ZONE_ID=new\n');
});

test('appends the key when the file does not have it yet', () => {
  const after = upsertEnv('DNS_CV_DOMAIN=osmarpetry.dev\n', 'CLOUDFLARE_ZONE_ID', 'abc123');
  assert.equal(after, 'DNS_CV_DOMAIN=osmarpetry.dev\nCLOUDFLARE_ZONE_ID=abc123\n');
});

test('appends to a file that does not end in a newline', () => {
  const after = upsertEnv('DNS_CV_DOMAIN=osmarpetry.dev', 'CLOUDFLARE_ZONE_ID', 'abc123');
  assert.equal(after, 'DNS_CV_DOMAIN=osmarpetry.dev\nCLOUDFLARE_ZONE_ID=abc123\n');
});

test('does not confuse a key with another key that shares its prefix', () => {
  const before = 'CLOUDFLARE_ZONE_ID_OLD=keep\nCLOUDFLARE_ZONE_ID=\n';
  const after = upsertEnv(before, 'CLOUDFLARE_ZONE_ID', 'abc123');
  assert.equal(after, 'CLOUDFLARE_ZONE_ID_OLD=keep\nCLOUDFLARE_ZONE_ID=abc123\n');
});

test('refuses a zone whose id is not a usable string, instead of writing it to .env', () => {
  const payload = { result: [{ id: '', name: 'osmarpetry.dev' }] } as never;
  assert.throws(() => zoneIdFrom(payload, 'osmarpetry.dev'), /usable id/);
});
