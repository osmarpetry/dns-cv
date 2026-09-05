import { readFileSync } from 'node:fs';

import { fetchResume, parseResume } from './resume.ts';
import type { ResumeSections } from './resume.ts';

export const SECTION_NAMES = ['home', 'projects', 'experience', 'contact'] as const;

/** The CV published by the site, which also feeds `/resume/` and the PDF. */
export const DEFAULT_RESUME_SOURCE = 'https://osmarpetry.dev/resume.md';

export type SectionName = (typeof SECTION_NAMES)[number];

export function isSectionName(value: string): value is SectionName {
  return (SECTION_NAMES as readonly string[]).includes(value);
}

/** `home` lives at the apex of the CV zone; every other section is a child of it. */
export function hostFor(section: SectionName, domain: string): string {
  return section === 'home' ? `cv.${domain}` : `${section}.cv.${domain}`;
}

/** Loads the CV once, so one fetch serves every section of a build. */
export async function loadResume(source: string): Promise<ResumeSections> {
  return parseResume(await fetchResume(source));
}

/**
 * Resolves one section, with the `{{domain}}` placeholder filled in.
 *
 * `home`, `experience` and `contact` are derived from the CV, so there is a
 * single place to edit them. `projects` is written here because selected work
 * is not part of a CV.
 */
export function readSection(section: SectionName, domain: string, resume: ResumeSections): string {
  const text = section === 'projects' ? readProjects() : resume[section];
  return text.replaceAll('{{domain}}', domain);
}

function readProjects(): string {
  return readFileSync(new URL('../content/projects.md', import.meta.url), 'utf8');
}
