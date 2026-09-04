/** A single DNS TXT character-string may hold at most 255 bytes (RFC 1035 §3.3.14). */
export const MAX_STRING_BYTES = 255;

/**
 * Splits `value` into strings of at most `maxBytes` UTF-8 bytes, never cutting a
 * character in half. Joining the result reproduces `value` exactly, which is how
 * resolvers reassemble a multi-string TXT record.
 */
export function chunkUtf8(value: string, maxBytes: number = MAX_STRING_BYTES): string[] {
  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;

  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, 'utf8');
    if (currentBytes + characterBytes > maxBytes) {
      chunks.push(current);
      current = '';
      currentBytes = 0;
    }
    current += character;
    currentBytes += characterBytes;
  }
  if (current !== '') chunks.push(current);

  return chunks.length > 0 ? chunks : [''];
}

/**
 * Turns section text into a single DNS TXT value.
 *
 * Line breaks become the two literal characters `\` + `n`, and anything that
 * would need escaping in DNS presentation format (quotes, backslashes) or that
 * renders differently across resolvers (non-ASCII, control bytes) is rejected
 * at build time. That keeps the client-side parser trivial: no escape handling,
 * and no ANSI sequence can ever arrive from the network.
 */
export function toDnsValue(text: string): string {
  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd());

  while (lines.length > 0 && lines.at(-1) === '') lines.pop();
  while (lines.length > 0 && lines[0] === '') lines.shift();

  const value = lines.join('\n');
  assertDnsSafe(value);

  return value.replaceAll('\n', '\\n');
}

const UNSAFE_CHARACTERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/"/, 'a double quote'],
  [/\\/, 'a backslash'],
  [/[\x00-\x09\x0b-\x1f\x7f]/, 'a control character'],
  [/[^\x20-\x7e\n]/, 'a non-ASCII character'],
];

function assertDnsSafe(value: string): void {
  for (const [pattern, description] of UNSAFE_CHARACTERS) {
    const match = pattern.exec(value);
    if (match === null) continue;
    throw new Error(
      `Content contains ${description} (${JSON.stringify(match[0])}) at offset ${match.index}. ` +
        'DNS values must be plain ASCII, without quotes or backslashes.',
    );
  }
}

/** Default budget for one TXT record; providers and resolvers vary, so it is configurable. */
export const DEFAULT_MAX_RECORD_BYTES = 2048;

export interface TxtRecord {
  readonly name: string;
  readonly strings: readonly string[];
  readonly bytes: number;
}

/** Encodes one CV section as a single TXT record made of 255-byte strings. */
export function buildRecord(
  name: string,
  text: string,
  maxRecordBytes: number = DEFAULT_MAX_RECORD_BYTES,
): TxtRecord {
  const value = toDnsValue(text);
  const bytes = Buffer.byteLength(value, 'utf8');

  if (bytes > maxRecordBytes) {
    throw new Error(
      `Section "${name}" is ${bytes} bytes, over the ${maxRecordBytes}-byte record budget. ` +
        'Shorten the content or move part of it to another subdomain.',
    );
  }

  return { name, strings: chunkUtf8(value), bytes };
}
