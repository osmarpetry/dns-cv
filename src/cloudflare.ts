import type { TxtRecord } from './txt.ts';

const API = 'https://api.cloudflare.com/client/v4';

export interface CloudflareOptions {
  readonly token: string;
  readonly zoneId: string;
  readonly ttl: number;
}

/**
 * Cloudflare stores a multi-string TXT record as quoted segments in `content`.
 * Section content is validated ASCII without quotes or backslashes, so no
 * escaping is needed here.
 */
export function toRecordContent(strings: readonly string[]): string {
  return strings.map((value) => `"${value}"`).join(' ');
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

async function request<T = unknown>(
  options: CloudflareOptions,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${options.token}`,
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
