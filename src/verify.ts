import { Resolver } from 'node:dns/promises';

/** Public resolver, so a stale answer in the local cache cannot pass for a successful publish. */
export const RESOLVER_ADDRESS = '1.1.1.1';

export interface BuiltRecord {
  readonly host: string;
  readonly strings: readonly string[];
}

export interface Drift {
  readonly host: string;
  readonly reason: string;
}

/** A resolver returns one array of 255-byte chunks per TXT record on the host. */
export type LiveRecords = ReadonlyMap<string, ReadonlyArray<readonly string[]>>;

/**
 * Compares what was built against what the resolver actually serves.
 *
 * A host may carry TXT records that have nothing to do with the CV, so a host
 * counts as published when any of its records matches.
 */
export function compareRecords(built: readonly BuiltRecord[], live: LiveRecords): Drift[] {
  const drift: Drift[] = [];

  for (const { host, strings } of built) {
    const answers = live.get(host) ?? [];

    if (answers.length === 0) {
      drift.push({ host, reason: 'no TXT record answered' });
      continue;
    }

    const wanted = strings.join('');
    if (!answers.some((chunks) => chunks.join('') === wanted)) {
      drift.push({
        host,
        reason: `still serving different content — the previous TTL may not have expired yet`,
      });
    }
  }

  return drift;
}

/** ENOTFOUND and ENODATA both mean "nothing published here yet"; anything else is a real fault. */
export function isNotPublished(error: unknown): boolean {
  const code = (error as { code?: unknown }).code;
  return code === 'ENOTFOUND' || code === 'ENODATA';
}

/** Reads every host from the public resolver. A host with no record maps to an empty list. */
export async function resolveLive(hosts: readonly string[]): Promise<LiveRecords> {
  const resolver = new Resolver();
  resolver.setServers([RESOLVER_ADDRESS]);

  const entries = await Promise.all(
    hosts.map(async (host): Promise<[string, string[][]]> => {
      try {
        return [host, await resolver.resolveTxt(host)];
      } catch (error) {
        if (isNotPublished(error)) return [host, []];
        throw error;
      }
    }),
  );

  return new Map(entries);
}
