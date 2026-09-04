import { mkdirSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { publishRecord, toRecordContent } from './cloudflare.ts';
import { renderSection } from './render.ts';
import { hostFor, isSectionName, readSection, SECTION_NAMES } from './sections.ts';
import type { SectionName } from './sections.ts';
import { buildRecord, DEFAULT_MAX_RECORD_BYTES } from './txt.ts';
import type { TxtRecord } from './txt.ts';

interface Config {
  readonly domain: string;
  readonly maxRecordBytes: number;
  readonly ttl: number;
}

interface BuiltSection {
  readonly section: SectionName;
  readonly host: string;
  readonly record: TxtRecord;
}

const DIST = new URL('../dist/', import.meta.url);

try {
  await run();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

async function run(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      section: { type: 'string' },
      plain: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
    },
  });

  const config = readConfig();
  const command = positionals[0] ?? 'validate';

  switch (command) {
    case 'build':
      return build(config);
    case 'validate':
      return validate(config);
    case 'preview':
      return preview(config, {
        section: values.section,
        color: !values.plain && process.stdout.isTTY === true,
      });
    case 'publish':
      return values['dry-run'] ? printPublishPlan(config) : publish(config);
    default:
      throw new Error(`Unknown command "${command}". Use build, validate, preview or publish.`);
  }
}

function readConfig(): Config {
  loadEnvFile();
  return {
    domain: process.env.DNS_CV_DOMAIN ?? 'osmarpetry.dev',
    maxRecordBytes: Number(process.env.DNS_CV_MAX_BYTES ?? DEFAULT_MAX_RECORD_BYTES),
    ttl: Number(process.env.DNS_CV_TTL ?? 3600),
  };
}

function loadEnvFile(): void {
  try {
    process.loadEnvFile('.env');
  } catch {
    // Only publishing needs credentials; build, validate and preview run without a .env.
  }
}

function buildAll(config: Config): BuiltSection[] {
  return SECTION_NAMES.map((section) => ({
    section,
    host: hostFor(section, config.domain),
    record: buildRecord(section, readSection(section, config.domain), config.maxRecordBytes),
  }));
}

function build(config: Config): void {
  const built = buildAll(config);
  mkdirSync(DIST, { recursive: true });

  const manifest = built.map(({ section, host, record }) => ({
    section,
    host,
    strings: record.strings,
  }));
  writeFileSync(new URL('records.json', DIST), `${JSON.stringify(manifest, null, 2)}\n`);

  for (const { section, host, record } of built) {
    writeFileSync(new URL(`${section}.txt`, DIST), `${toRecordContent(record.strings)}\n`);
    printRecordSummary(host, record, config);
  }
  console.log('\nWrote dist/records.json and one .txt per section, ready to paste into any DNS UI.');
}

function validate(config: Config): void {
  for (const { host, record } of buildAll(config)) printRecordSummary(host, record, config);
  console.log('\nAll sections are ASCII-safe and within budget.');
}

function preview(config: Config, options: { section?: string; color: boolean }): void {
  const requested = options.section === undefined ? [...SECTION_NAMES] : [options.section];

  for (const name of requested) {
    if (!isSectionName(name)) {
      throw new Error(`Unknown section "${name}". Use one of: ${SECTION_NAMES.join(', ')}.`);
    }
    const record = buildRecord(name, readSection(name, config.domain), config.maxRecordBytes);
    console.log(renderSection(record.strings, { color: options.color }));
    console.log();
  }
}

function printPublishPlan(config: Config): void {
  for (const { host, record } of buildAll(config)) {
    console.log(
      `${host} TTL ${config.ttl} -> ${record.strings.length} string(s), ${record.bytes} bytes`,
    );
  }
  console.log('\nDry run: nothing was sent to Cloudflare.');
}

async function publish(config: Config): Promise<void> {
  const built = buildAll(config);
  const options = {
    token: requireEnv('CLOUDFLARE_API_TOKEN'),
    zoneId: requireEnv('CLOUDFLARE_ZONE_ID'),
    ttl: config.ttl,
  };

  for (const { host, record } of built) {
    const outcome = await publishRecord(options, host, record);
    console.log(`${outcome} ${host} (${record.bytes} bytes)`);
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
  }
  return value;
}

function printRecordSummary(host: string, record: TxtRecord, config: Config): void {
  const longest = Math.max(...record.strings.map((value) => value.length));
  console.log(
    `${host.padEnd(34)} ${String(record.bytes).padStart(5)}/${config.maxRecordBytes} bytes` +
      `  ${record.strings.length} string(s), longest ${longest}`,
  );
}
