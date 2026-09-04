import { readFileSync } from 'node:fs';

export const SECTION_NAMES = ['home', 'projects', 'experience', 'contact'] as const;

export type SectionName = (typeof SECTION_NAMES)[number];

export function isSectionName(value: string): value is SectionName {
  return (SECTION_NAMES as readonly string[]).includes(value);
}

/** `home` lives at the apex of the CV zone; every other section is a child of it. */
export function hostFor(section: SectionName, domain: string): string {
  return section === 'home' ? `cv.${domain}` : `${section}.cv.${domain}`;
}

/** Reads a section from `content/`, resolving the `{{domain}}` placeholder. */
export function readSection(section: SectionName, domain: string): string {
  const file = new URL(`../content/${section}.md`, import.meta.url);
  return readFileSync(file, 'utf8').replaceAll('{{domain}}', domain);
}
