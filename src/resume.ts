import { readFileSync } from 'node:fs';

/**
 * The CV lives in one markdown file, in the site repo, which also renders
 * `/resume/` and is the source the PDF is made from. This module turns that
 * file into the three DNS sections that are derived from it.
 *
 * A TXT record holds 2048 bytes; the `## Experience` section alone is 9502.
 * The short prose a terminal reader sees therefore cannot be squeezed out of
 * the long bullets — it has to exist as short prose in the source. It does, as
 * an HTML comment per role:
 *
 *     ### Cyberr
 *     #### Senior Software Engineer
 *     Luxembourg · Oct 2025 - Jun 2026
 *
 *     <!-- dns: Scheduling and meeting flows for a hiring platform. -->
 *
 * Every markdown renderer drops comments, so the line is invisible on the site
 * and in the PDF, and only this parser reads it. Opting in is per role: a role
 * without the comment stays out of the record, which is how 13 roles fit in a
 * budget that only holds a handful. `<!-- dns-earlier: ... -->` closes the
 * section with one line covering the roles that were left out.
 */

export interface ResumeSections {
  readonly home: string;
  readonly experience: string;
  readonly contact: string;
}

interface Role {
  readonly company: string;
  readonly title: string;
  readonly location: string;
  readonly dates: string;
  readonly dns: string | undefined;
}

/** Navigation and availability: true of the DNS CV, not of the CV. */
const KEEP_READING = `# Keep reading

Run the same command again, swapping the name for one of these:

- experience.cv.{{domain}}
- projects.cv.{{domain}}
- contact.cv.{{domain}}

Source and a reader script: github.com/osmarpetry/dns-cv
Web version: {{domain}}`;

const AVAILABILITY = `Work status: Luxembourgish and Brazilian citizen, EU work authorization

Open to: senior software and product engineering roles in the EU,
hybrid in Luxembourg or remote.

Back to the start: cv.{{domain}}`;

/** Reads the CV from a URL or a local path, so the build can run offline. */
export async function fetchResume(source: string): Promise<string> {
  if (!/^https?:\/\//.test(source)) return readFileSync(source, 'utf8');

  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Could not read the resume from ${source} (HTTP ${response.status}).`);
  }
  return response.text();
}

const SYMBOLS: ReadonlyArray<readonly [RegExp, string]> = [
  [/[·•]/g, '-'],
  [/[‐-―]/g, '-'],
  [/[‘’]/g, "'"],
  [/[“”]/g, "'"],
  [/[®™©]/g, ''],
  [/…/g, '...'],
];

/**
 * Folds the CV's typography down to ASCII, which `assertDnsSafe` in `txt.ts`
 * requires: accents are dropped by decomposing and removing the marks, and the
 * handful of symbols that carry meaning are mapped rather than deleted.
 */
export function toAscii(text: string): string {
  let value = text;
  for (const [pattern, replacement] of SYMBOLS) value = value.replace(pattern, replacement);
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function parseResume(markdown: string): ResumeSections {
  const source = toAscii(markdown);
  const blocks = splitOnHeadings(source);

  return {
    home: buildHome(source, blocks),
    experience: buildExperience(requireBlock(blocks, 'Experience')),
    contact: buildContact(blocks),
  };
}

/**
 * Splits on `## ` in document order. The first such heading is the job title
 * rather than a section, and its body holds the contact list.
 */
function splitOnHeadings(markdown: string): Map<string, string> {
  const blocks = new Map<string, string>();

  for (const part of markdown.split(/^## /m).slice(1)) {
    const breakAt = part.indexOf('\n');
    const heading = (breakAt === -1 ? part : part.slice(0, breakAt)).trim();
    blocks.set(heading, breakAt === -1 ? '' : part.slice(breakAt + 1));
  }

  return blocks;
}

function requireBlock(blocks: Map<string, string>, heading: string): string {
  const body = blocks.get(heading);
  if (body === undefined) {
    throw new Error(`The resume has no "## ${heading}" section; the DNS CV is built from it.`);
  }
  return body;
}

function buildHome(source: string, blocks: Map<string, string>): string {
  const name = /^# (.+)$/m.exec(source)?.[1]?.trim();
  if (name === undefined) throw new Error('The resume has no "# Name" heading.');

  const title = [...blocks.keys()][0];
  if (title === undefined) throw new Error('The resume has no job title heading.');

  const summary = paragraph(requireBlock(blocks, 'Summary'));
  const skills = paragraph(requireBlock(blocks, 'Core Skills'));

  return `# ${name} - ${title}\n\n${summary}\n\nStack: ${skills}\n\n${KEEP_READING}`;
}

function buildExperience(body: string): string {
  const bullets = parseRoles(body)
    .filter((role): role is Role & { dns: string } => role.dns !== undefined)
    .map(
      (role) =>
        `- ${role.company}, ${role.title}, ${role.location}, ${role.dates}\n${indent(role.dns)}`,
    );

  if (bullets.length === 0) {
    throw new Error(
      'In "## Experience", no role carries a <!-- dns: --> comment, ' +
        'so the record would be empty. Add one to the roles that belong in the terminal CV.',
    );
  }

  const earlier = /<!--\s*dns-earlier:\s*([\s\S]*?)-->/.exec(body)?.[1]?.trim();
  if (earlier !== undefined) bullets.push(`- Earlier: ${indent(earlier).trimStart()}`);

  return `# Experience\n\n${bullets.join('\n\n')}\n\nFull history: {{domain}}`;
}

function parseRoles(body: string): Role[] {
  return body
    .split(/^### /m)
    .slice(1)
    .map((block) => {
      const lines = block.split('\n');
      const company = (lines[0] ?? '').trim();
      const titleAt = lines.findIndex((line) => line.startsWith('#### '));
      if (titleAt === -1) throw new Error(`The role "${company}" has no "#### Title" line.`);

      const meta = lines.slice(titleAt + 1).find((line) => line.trim() !== '') ?? '';
      const [location = '', dates = ''] = meta.split('-').length > 1 ? splitMeta(meta) : ['', ''];

      return {
        company,
        title: (lines[titleAt] ?? '').slice(5).trim(),
        location,
        dates,
        dns: /<!--\s*dns:\s*([\s\S]*?)-->/.exec(block)?.[1]?.trim(),
      };
    });
}

/** `Luxembourg - Oct 2025 - Present`: the first dash separates, the rest is the range. */
function splitMeta(meta: string): [string, string] {
  const at = meta.indexOf('-');
  return [meta.slice(0, at).trim(), meta.slice(at + 1).trim()];
}

const CONTACT_LABELS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^mailto:/, 'Email'],
  [/^tel:/, 'Phone'],
  [/github\.com/, 'GitHub'],
  [/linkedin\.com/, 'LinkedIn'],
  [/maps\./, 'Location'],
];

function buildContact(blocks: Map<string, string>): string {
  const list = [...blocks.values()][0] ?? '';
  const lines: string[] = [];

  for (const match of list.matchAll(/<li><a href="([^"]*)"[^>]*>([^<]*)<\/a><\/li>/g)) {
    const [, href = '', text = ''] = match;
    const label = CONTACT_LABELS.find(([pattern]) => pattern.test(href))?.[1] ?? 'Site';
    lines.push(`${label}: ${text.trim()}`);
  }

  if (lines.length === 0) {
    throw new Error('The resume has no <ul class="resume-contact"> list to build Contact from.');
  }

  return `# Contact\n\n${lines.join('\n')}\n\n${AVAILABILITY}`;
}

function paragraph(body: string): string {
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('<'))
    .join(' ');
}

function indent(text: string): string {
  return text
    .split('\n')
    .map((line) => `  ${line.trim()}`)
    .join('\n');
}
