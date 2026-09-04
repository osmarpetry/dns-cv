import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../bin/cv.sh', import.meta.url));
const ESC = String.fromCharCode(27);

/** Builds a stub resolver that prints `answer` the way `dig +short TXT` would. */
function fakeDig(answer: string, exitCode = 0): string {
  const dir = mkdtempSync(join(tmpdir(), 'dns-cv-'));
  const path = join(dir, 'dig');
  writeFileSync(path, `#!/bin/sh\ncat <<'ANSWER'\n${answer}\nANSWER\nexit ${exitCode}\n`);
  chmodSync(path, 0o755);
  return path;
}

function run(answer: string, args: string[] = []): string {
  return execFileSync(SCRIPT, [...args, 'cv.example.com'], {
    env: { ...process.env, DIG: fakeDig(answer) },
    encoding: 'utf8',
  });
}

test('concatenates the TXT strings and expands the literal line breaks', () => {
  const output = run('"# Osmar Petry\\nSenior Product " "Engineer\\nLuxembourg"', ['--plain']);

  assert.equal(output, '# Osmar Petry\nSenior Product Engineer\nLuxembourg\n');
});

test('handles the doubled backslashes some resolvers print', () => {
  const output = run('"first\\\\nsecond"', ['--plain']);

  assert.equal(output, 'first\nsecond\n');
});

test('never emits escape sequences from the DNS answer', () => {
  const output = run(`"${ESC}[2Jwiped\\nplain text"`, ['--plain']);

  assert.ok(!output.includes(ESC));
  assert.equal(output, '[2Jwiped\nplain text\n');
});

test('expands the colour markers the record carries', () => {
  const output = run('"\\033[1;36mOsmar Petry\\033[0m"', ['--color']);

  assert.equal(output, `${ESC}[1;36mOsmar Petry${ESC}[0m\n`);
});

test('expands markers a resolver printed with doubled backslashes', () => {
  const output = run('"\\\\033[33m-\\\\033[0m item"', ['--color']);

  assert.equal(output, `${ESC}[33m-${ESC}[0m item\n`);
});

test('drops the markers instead of colouring when plain output is asked for', () => {
  const output = run('"\\033[1;36mOsmar Petry\\033[0m"', ['--plain']);

  assert.equal(output, 'Osmar Petry\n');
});

test('adds no colour of its own to a record that carries no markers', () => {
  const output = run('"# Osmar Petry"', ['--color']);

  assert.equal(output, '# Osmar Petry\n');
});

test('refuses a hyperlink sequence even when the record carries one', () => {
  const output = run('"\\033]8;;http://evil\\aclick me"', ['--color']);

  assert.ok(!output.includes(ESC), 'no escape byte may reach the terminal');
  assert.ok(output.includes('click me'));
});

test('refuses cursor movement dressed as a colour marker', () => {
  const output = run('"\\033[2Jwiped"', ['--color']);

  assert.ok(!output.includes(ESC));
  assert.ok(output.includes('wiped'));
});

test('fails with a clear message when the name has no TXT record', () => {
  assert.throws(
    () => run(''),
    (error: Error & { stderr?: string }) => /no TXT record/i.test(error.stderr ?? ''),
  );
});

test('fails with a clear message when no resolver is installed', () => {
  assert.throws(
    () =>
      execFileSync(SCRIPT, ['cv.example.com'], {
        env: { ...process.env, DIG: 'definitely-not-installed' },
        encoding: 'utf8',
      }),
    (error: Error & { stderr?: string }) => /not found/i.test(error.stderr ?? ''),
  );
});

test('requires a hostname', () => {
  assert.throws(
    () => execFileSync(SCRIPT, { encoding: 'utf8' }),
    (error: Error & { stderr?: string }) => /usage/i.test(error.stderr ?? ''),
  );
});

test('reports a failing resolver separately from a missing record', () => {
  assert.throws(
    () =>
      execFileSync(SCRIPT, ['cv.example.com'], {
        env: { ...process.env, DIG: fakeDig('', 1) },
        encoding: 'utf8',
      }),
    (error: Error & { stderr?: string }) => /resolver reachable/i.test(error.stderr ?? ''),
  );
});
