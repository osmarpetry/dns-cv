export interface Credentials {
  readonly token: string;
  readonly zoneId: string;
}

type Env = Record<string, string | undefined>;

const STEPS: ReadonlyArray<{ key: string; fix: string }> = [
  {
    key: 'CLOUDFLARE_API_TOKEN',
    fix:
      'Set CLOUDFLARE_API_TOKEN in .env. Create the token at My Profile > API Tokens > ' +
      'Create Token > Custom token, with Permissions: Zone > DNS > Edit and ' +
      'Zone Resources: Include > Specific zone > your zone.',
  },
  {
    key: 'CLOUDFLARE_ZONE_ID',
    fix: 'Set CLOUDFLARE_ZONE_ID in .env by running `npm run setup`, which reads it from the API.',
  },
];

/**
 * Everything still missing before a publish can work, reported in one pass so
 * the setup is not discovered one failed run at a time.
 */
export function missingSetupSteps(env: Env): string[] {
  return STEPS.filter(({ key }) => (env[key] ?? '') === '').map(({ fix }) => fix);
}

/** Credentials for publishing, or an error naming every pending step. Makes no network call. */
export function requireCompleteSetup(env: Env): Credentials {
  const pending = missingSetupSteps(env);
  if (pending.length > 0) {
    throw new Error(`Setup is incomplete:\n${pending.map((step) => `  - ${step}`).join('\n')}`);
  }

  return { token: env.CLOUDFLARE_API_TOKEN!, zoneId: env.CLOUDFLARE_ZONE_ID! };
}

/** The API token alone — all `setup` needs, since it is what resolves the zone id. */
export function requireToken(env: Env): string {
  const token = env.CLOUDFLARE_API_TOKEN ?? '';
  if (token === '') throw new Error(`Setup is incomplete:\n  - ${STEPS[0]!.fix}`);
  return token;
}
