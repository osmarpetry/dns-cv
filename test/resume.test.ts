import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseResume, toAscii } from '../src/resume.ts';

/** The shape of the real CV, small enough to assert against in full. */
const FIXTURE = `# Osmar Petry

## Senior Software Engineer

<ul class="resume-contact">
  <li><a href="https://maps.app.goo.gl/x" target="_blank">Luxembourg, LU</a></li>
  <li><a href="mailto:osmarpetry@gmail.com">osmarpetry@gmail.com</a></li>
  <li><a href="https://github.com/osmarpetry">github.com/osmarpetry</a></li>
</ul>

## Summary

Luxembourgish Senior Software Engineer with 10+ years of experience.

## Core Skills

TypeScript, React, Node.js

## Experience

### Deelan
#### Senior Software Engineer
Luxembourg · Jun 2026 - Present

<!-- dns: RAG workflows on Pinecone and session intelligence end to end. -->

- A long bullet that belongs to the PDF and must never reach the DNS record.
- Another long bullet, equally unwelcome in a 2048-byte budget.

### Cyberr®
#### Senior Software Engineer
Luxembourg · Oct 2025 - Jun 2026

<!-- dns: Scheduling and meeting flows for a cybersecurity hiring platform. -->

- Bullet for the PDF only.

### CoBlue OKR
#### Frontend Software Engineer
São Paulo Area, Brazil · Jun 2018 - Dec 2018

- No dns comment, so this role stays out of the record.

<!-- dns-earlier: NG Informatica/TOTVS, CoBlue OKR and Envolve Labs, 2015 to 2019. -->

## Education

- **Bachelor's Degree** - Católica de Santa Catarina (2015 - 2018)
`;

test('home carries the name, title, summary and skills', () => {
  const { home } = parseResume(FIXTURE);

  assert.match(home, /^# Osmar Petry - Senior Software Engineer$/m);
  assert.match(home, /Luxembourgish Senior Software Engineer with 10\+ years/);
  assert.match(home, /^Stack: TypeScript, React, Node\.js$/m);
});

test('experience renders one line per role, with the dns prose indented under it', () => {
  const { experience } = parseResume(FIXTURE);

  assert.match(experience, /^- Deelan, Senior Software Engineer, Luxembourg, Jun 2026 - Present$/m);
  assert.match(experience, /^ {2}RAG workflows on Pinecone and session intelligence end to end\.$/m);
});

test('the PDF bullets never reach the record', () => {
  const { experience } = parseResume(FIXTURE);

  assert.ok(!experience.includes('belongs to the PDF'));
  assert.ok(!experience.includes('Bullet for the PDF only'));
});

test('a role without a dns comment is left out', () => {
  const { experience } = parseResume(FIXTURE);

  assert.ok(!experience.includes('CoBlue OKR, Frontend Software Engineer'));
});

test('dns-earlier closes the section as the last bullet', () => {
  const { experience } = parseResume(FIXTURE);
  const bullets = experience.split('\n').filter((line) => line.startsWith('- '));

  assert.equal(bullets.at(-1), '- Earlier: NG Informatica/TOTVS, CoBlue OKR and Envolve Labs, 2015 to 2019.');
});

test('a multi-line dns-earlier keeps its continuation indented under the bullet', () => {
  const wrapped = FIXTURE.replace(
    '<!-- dns-earlier: NG Informatica/TOTVS, CoBlue OKR and Envolve Labs, 2015 to 2019. -->',
    '<!-- dns-earlier: NG Informatica/TOTVS, CoBlue OKR\nand Envolve Labs, 2015 to 2019. -->',
  );

  const { experience } = parseResume(wrapped);

  assert.match(experience, /^- Earlier: NG Informatica\/TOTVS, CoBlue OKR$/m);
  assert.match(experience, /^ {2}and Envolve Labs, 2015 to 2019\.$/m);
});

test('contact comes from the resume-contact list, without the markup', () => {
  const { contact } = parseResume(FIXTURE);

  assert.match(contact, /^Location: Luxembourg, LU$/m);
  assert.match(contact, /^Email: osmarpetry@gmail\.com$/m);
  assert.match(contact, /^GitHub: github\.com\/osmarpetry$/m);
  assert.ok(!contact.includes('<li>'));
  assert.ok(!contact.includes('href'));
});

test('every section is plain ASCII, because DNS values must be', () => {
  const sections = parseResume(FIXTURE);

  for (const [name, text] of Object.entries(sections)) {
    const offending = /[^\x20-\x7e\n]/.exec(text);
    assert.equal(offending, null, `${name} contains ${JSON.stringify(offending?.[0])}`);
  }
});

test('transliterates the characters the CV actually uses', () => {
  assert.equal(toAscii('Luxembourg · Oct 2025'), 'Luxembourg - Oct 2025');
  assert.equal(toAscii('Cyberr®'), 'Cyberr');
  assert.equal(toAscii('Pontifícia'), 'Pontificia');
  assert.equal(toAscii('São Paulo'), 'Sao Paulo');
});

test('fails loudly when no role opted into the record', () => {
  const withoutComments = FIXTURE.replace(/<!-- dns.*?-->/g, '');

  assert.throws(
    () => parseResume(withoutComments),
    /no role carries a <!-- dns: --> comment/,
  );
});

test('fails loudly when a heading the sections depend on is missing', () => {
  const withoutSummary = FIXTURE.replace('## Summary', '## Overview');

  assert.throws(() => parseResume(withoutSummary), /Summary/);
});
