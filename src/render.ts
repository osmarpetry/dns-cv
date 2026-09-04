import { expandMarkers } from './sgr.ts';

export interface RenderOptions {
  readonly color: boolean;
}

/**
 * Renders the strings of a TXT record for a terminal.
 *
 * Colour was decided at build time and arrives as `\033[...m` markers, which
 * are expanded here or dropped for plain output. Any real control byte in the
 * answer is removed rather than forwarded: DNS answers are untrusted input and
 * must never drive the terminal.
 */
export function renderSection(strings: readonly string[], options: RenderOptions): string {
  const text = strings.join('').replaceAll('\\n', '\n');

  return text
    .split('\n')
    .map((line) => expandMarkers(stripControl(line), options))
    .join('\n');
}

function stripControl(line: string): string {
  return line.replace(/[\u0000-\u001f\u007f]/g, '');
}
