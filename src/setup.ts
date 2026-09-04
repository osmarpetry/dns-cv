import { callApi } from './cloudflare.ts';

interface ZoneList {
  readonly result?: ReadonlyArray<{ id: string; name: string }>;
}

/**
 * Picks the zone id out of a `GET /zones?name=` response.
 *
 * A token scoped to a single zone sees exactly that zone, so anything other
 * than one result means the token was created wrong. Say which, rather than
 * writing a wrong id into `.env`.
 */
export function zoneIdFrom(payload: ZoneList, domain: string): string {
  const zones = payload.result ?? [];

  if (zones.length === 1) {
    const { id } = zones[0]!;
    // The id comes off the network and goes straight into .env, so check it there.
    if (typeof id !== 'string' || id === '') {
      throw new Error(`Cloudflare returned a zone for ${domain} without a usable id.`);
    }
    return id;
  }

  if (zones.length === 0) {
    throw new Error(
      `No zone named ${domain} is visible to this token. Recreate it with ` +
        'Zone Resources: Include > Specific zone > ' +
        `${domain}, and Permissions: Zone > DNS > Edit.`,
    );
  }

  const names = zones.map((zone) => zone.name).join(', ');
  throw new Error(
    `Expected one zone named ${domain}, got ${zones.length} zones (${names}). ` +
      'Scope the token to a single zone.',
  );
}

/** Sets `key` in a `.env` file, leaving every other line, comment and blank exactly as it was. */
export function upsertEnv(text: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const lines = text.split('\n');
  const index = lines.findIndex((current) => current.startsWith(`${key}=`));

  if (index !== -1) {
    lines[index] = line;
    return lines.join('\n');
  }

  const body = text.endsWith('\n') || text === '' ? text : `${text}\n`;
  return `${body}${line}\n`;
}

/** Asks Cloudflare which zone id backs `domain`. The token is never logged. */
export async function resolveZoneId(token: string, domain: string): Promise<string> {
  const query = new URLSearchParams({ name: domain });
  return zoneIdFrom(await callApi<ZoneList>(token, 'GET', `/zones?${query}`), domain);
}
