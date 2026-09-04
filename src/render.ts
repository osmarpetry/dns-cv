const ESC = String.fromCharCode(27);
const RESET = `${ESC}[0m`;

/** The only escape sequences this project ever emits: SGR colour and style. */
const STYLES = {
  heading: `${ESC}[1;36m`,
  bullet: `${ESC}[33m`,
  label: `${ESC}[1m`,
  command: `${ESC}[32m`,
} as const;

export interface RenderOptions {
  readonly color: boolean;
}

/**
 * Renders the strings of a TXT record for a terminal.
 *
 * The record itself is plain ASCII, so colour is decided here, from the shape of
 * each line. Any control byte in the response is dropped rather than forwarded:
 * DNS answers are untrusted input and must never drive the terminal.
 */
export function renderSection(strings: readonly string[], options: RenderOptions): string {
  const lines = strings.join('').replaceAll('\\n', '\n').split('\n').map(stripControl);

  return lines.map((line) => (options.color ? colorize(line) : line)).join('\n');
}

function stripControl(line: string): string {
  return line.replace(/[\u0000-\u001f\u007f]/g, '');
}

function colorize(line: string): string {
  if (line.startsWith('# ')) return `${STYLES.heading}${line.slice(2)}${RESET}`;
  if (line.startsWith('$ ')) return `${STYLES.command}${line}${RESET}`;
  if (line.startsWith('- ')) return `${STYLES.bullet}-${RESET} ${line.slice(2)}`;

  const label = /^([A-Za-z][\w .+-]*):(\s.*)$/.exec(line);
  if (label) return `${STYLES.label}${label[1]}:${RESET}${label[2]}`;

  return line;
}
