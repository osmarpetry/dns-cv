/**
 * Colour for the CV, carried inside the record as the literal characters
 * `\` `0` `3` `3` rather than as a real escape byte.
 *
 * Only SGR (Select Graphic Rendition) is allowed: a sequence ending in `m`,
 * which can change colour and weight and nothing else. Hyperlinks (OSC 8),
 * cursor movement and screen clearing are rejected at build time, so a record
 * that is ever hijacked can print the wrong colours and no more.
 */
const MARKER = '\\033';

const STYLES = {
  heading: `${MARKER}[1;36m`,
  bullet: `${MARKER}[33m`,
  label: `${MARKER}[1m`,
  command: `${MARKER}[32m`,
} as const;

const RESET = `${MARKER}[0m`;

/** Every backslash sequence a published value is allowed to contain. */
const ALLOWED = /\\n|\\033\[[0-9;]*m/g;
const COLOUR_MARKER = /\\033\[([0-9;]*)m/g;

export interface ExpandOptions {
  readonly color: boolean;
}

/** Adds colour markers to one line, chosen from its shape. Plain lines stay plain. */
export function markupLine(line: string): string {
  if (line.startsWith('# ')) return `${STYLES.heading}${line.slice(2)}${RESET}`;
  if (line.startsWith('$ ')) return `${STYLES.command}${line}${RESET}`;
  if (line.startsWith('- ')) return `${STYLES.bullet}-${RESET} ${line.slice(2)}`;

  const label = /^([A-Za-z][\w .+-]*):(\s.*)$/.exec(line);
  if (label) return `${STYLES.label}${label[1]}:${RESET}${label[2]}`;

  return line;
}

/** Turns the markers into real escapes for a terminal, or removes them for plain output. */
export function expandMarkers(text: string, options: ExpandOptions): string {
  const escape = String.fromCharCode(27);
  return text.replace(COLOUR_MARKER, (_match, params: string) =>
    options.color ? `${escape}[${params}m` : '',
  );
}

/**
 * Fails unless every backslash in `value` starts a newline or a colour marker.
 *
 * This is the boundary that keeps the one-line `printf '%b'` reader safe: it is
 * checked before publishing, so nothing else can reach a reader's terminal.
 */
export function assertOnlyColorMarkers(value: string): void {
  const hyperlink = value.indexOf('\\033]');
  if (hyperlink !== -1) {
    throw new Error('Content contains \\033] (an OSC sequence, such as a hyperlink).');
  }

  const remainder = value.replace(ALLOWED, '');
  const stray = remainder.indexOf('\\');
  if (stray !== -1) {
    throw new Error(
      `Content contains ${JSON.stringify(remainder.slice(stray, stray + 8))}; ` +
        'only colour markers (\\033[...m) and line breaks (\\n) may be published.',
    );
  }
}
