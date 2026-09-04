import type { TxtRecord } from './txt.ts';

const API = 'https://api.cloudflare.com/client/v4';

export interface CloudflareOptions {
  readonly token: string;
  readonly zoneId: string;
  readonly ttl: number;
}

/**
 * Cloudflare stores a multi-string TXT record as quoted segments in `content`,
 * read as DNS presentation format.
 *
 * There, `\n` means the literal character `n` — the backslash is consumed. The
 * only backslashes in a section are the ones `toDnsValue` added for line breaks,
 * so they are doubled here; a resolver then hands back `\` + `n`, which the
 * renderer turns into a newline. Quotes never reach this point: `assertDnsSafe`
 * rejects them at build time.
 */
export function toRecordContent(strings: readonly string[]): string {
  return strings.map((value) => `"${value.replaceAll('\\', '\\\\')}"`).join(' ');
}

/** Creates the TXT record for `host`, or updates it when it already exists. */
export async function publishRecord(
  options: CloudflareOptions,
  host: string,
  record: TxtRecord,
): Promise<'created' | 'updated'> {
  const body = {
    type: 'TXT',
    name: host,
    content: toRecordContent(record.strings),
    ttl: options.ttl,
    comment: 'dns-cv',
  };

  const existingId = await findRecordId(options, host);
  if (existingId === undefined) {
    await request(options, 'POST', `/zones/${options.zoneId}/dns_records`, body);
    return 'created';
  }

  await request(options, 'PUT', `/zones/${options.zoneId}/dns_records/${existingId}`, body);
  return 'updated';
}

async function findRecordId(
  options: CloudflareOptions,
  host: string,
): Promise<string | undefined> {
  const query = new URLSearchParams({ type: 'TXT', name: host });
  const found = await request<{ result: Array<{ id: string }> }>(
    options,
    'GET',
    `/zones/${options.zoneId}/dns_records?${query}`,
  );

  return found.result[0]?.id;
}

function request<T = unknown>(
  options: CloudflareOptions,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  return callApi<T>(options.token, method, path, body);
}

/**
 * The single place that reaches the Cloudflare API, so the rule that an error
 * never carries the request headers is written down once.
 */
export async function callApi<T = unknown>(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = (await response.json()) as { success?: boolean; errors?: Array<{ message: string }> };
  if (!response.ok || payload.success === false) {
    // Never include the request headers here: they carry the API token.
    const reason = payload.errors?.map((error) => error.message).join('; ') ?? response.statusText;
    throw new Error(`Cloudflare ${method} ${path.split('?')[0]} failed (${response.status}): ${reason}`);
  }

  return payload as T;
}
