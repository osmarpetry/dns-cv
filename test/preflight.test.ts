import { test } from 'node:test';
import assert from 'node:assert/strict';

import { missingSetupSteps, requireCompleteSetup, requireToken } from '../src/preflight.ts';

test('asks for the token when it is missing', () => {
  const steps = missingSetupSteps({ CLOUDFLARE_ZONE_ID: 'abc123' });
  assert.equal(steps.length, 1);
  assert.match(steps[0]!, /CLOUDFLARE_API_TOKEN/);
  assert.match(steps[0]!, /Zone > DNS > Edit/);
});

test('treats an empty token the same as an absent one', () => {
  const steps = missingSetupSteps({ CLOUDFLARE_API_TOKEN: '', CLOUDFLARE_ZONE_ID: 'abc123' });
  assert.equal(steps.length, 1);
  assert.match(steps[0]!, /CLOUDFLARE_API_TOKEN/);
});

test('points at npm run setup when only the zone id is missing', () => {
  const steps = missingSetupSteps({ CLOUDFLARE_API_TOKEN: 'secret' });
  assert.equal(steps.length, 1);
  assert.match(steps[0]!, /npm run setup/);
});

test('reports nothing to do once both are present', () => {
  const steps = missingSetupSteps({ CLOUDFLARE_API_TOKEN: 'secret', CLOUDFLARE_ZONE_ID: 'abc123' });
  assert.deepEqual(steps, []);
});

test('lists every pending step at once instead of one per run', () => {
  const steps = missingSetupSteps({});
  assert.equal(steps.length, 2);
});

test('requireCompleteSetup throws with all pending steps in the message', () => {
  assert.throws(() => requireCompleteSetup({}), (error: Error) => {
    assert.match(error.message, /CLOUDFLARE_API_TOKEN/);
    assert.match(error.message, /npm run setup/);
    return true;
  });
});

test('requireCompleteSetup returns the credentials when the setup is complete', () => {
  const ready = requireCompleteSetup({ CLOUDFLARE_API_TOKEN: 'secret', CLOUDFLARE_ZONE_ID: 'abc' });
  assert.deepEqual(ready, { token: 'secret', zoneId: 'abc' });
});

test('requireToken returns the token when it is set', () => {
  assert.equal(requireToken({ CLOUDFLARE_API_TOKEN: 'secret' }), 'secret');
});

test('requireToken explains how to create the token when it is missing', () => {
  assert.throws(() => requireToken({}), /Zone > DNS > Edit/);
});
