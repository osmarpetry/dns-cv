import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { publishRecord, toRecordContent } from './cloudflare.ts';
import { requireCompleteSetup, requireToken } from './preflight.ts';
import { renderSection } from './render.ts';
import type { ResumeSections } from './resume.ts';
import {
  DEFAULT_RESUME_SOURCE,
  hostFor,
  isSectionName,
  loadResume,
  readSection,
  SECTION_NAMES,
} from './sections.ts';
import type { SectionName } from './sections.ts';
import { resolveZoneId, upsertEnv } from './setup.ts';
import { buildRecord, DEFAULT_MAX_RECORD_BYTES } from './txt.ts';
import type { TxtRecord } from './txt.ts';
import { compareRecords, resolveLive, RESOLVER_ADDRESS } from './verify.ts';

interface Config {
  readonly domain: string;
  readonly maxRecordBytes: number;
  readonly ttl: number;
  readonly resumeSource: string;
}

interface BuiltSection {
  readonly section: SectionName;
  readonly host: string;
  readonly record: TxtRecord;
}

const DIST = new URL('../dist/', import.meta.url);
const ENV_FILE = '.env';

/** Cloudflare answers authoritatively within seconds, but a cached NXDOMAIN can outlive the publish. */
const VERIFY_ATTEMPTS = 6;
const VERIFY_WAIT_MS = 5000;

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

  // Resolving the zone id is the one command that needs no content.
  if (command === 'setup') return setup(config);

  // Loaded once per run: every section is derived from the same CV.
  const resume = await loadResume(config.resumeSource);

  switch (command) {
    case 'build':
      return build(config, resume);
    case 'validate':
      return validate(config, resume);
    case 'preview':
      return preview(config, resume, {
        section: values.section,
        color: !values.plain && process.stdout.isTTY === true,
      });
    case 'publish':
      return values['dry-run'] ? printPublishPlan(config, resume) : publish(config, resume);
    case 'verify':
      return verify(config, resume, { attempts: 1 });
    case 'ship':
      return ship(config, resume);
    default:
      throw new Error(
        `Unknown command "${command}". ` +
          'Use build, validate, preview, publish, setup, verify or ship.',
      );
  }
}

function readConfig(): Config {
  loadEnvFile();
  return {
    domain: process.env.DNS_CV_DOMAIN ?? 'osmarpetry.dev',
    maxRecordBytes: Number(process.env.DNS_CV_MAX_BYTES ?? DEFAULT_MAX_RECORD_BYTES),
    ttl: Number(process.env.DNS_CV_TTL ?? 3600),
    // A local path here builds from an unpublished edit, without a round trip.
    resumeSource: process.env.DNS_CV_RESUME ?? DEFAULT_RESUME_SOURCE,
  };
}

function loadEnvFile(): void {
  try {
    process.loadEnvFile('.env');
  } catch {
    // Only publishing needs credentials; build, validate and preview run without a .env.
  }
}

function buildAll(config: Config, resume: ResumeSections): BuiltSection[] {
  return SECTION_NAMES.map((section) => ({
    section,
    host: hostFor(section, config.domain),
    record: buildRecord(
      section,
      readSection(section, config.domain, resume),
      config.maxRecordBytes,
    ),
  }));
}

function build(config: Config, resume: ResumeSections): void {
  const built = buildAll(config, resume);
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

function validate(config: Config, resume: ResumeSections): void {
  for (const { host, record } of buildAll(config, resume)) printRecordSummary(host, record, config);
  console.log('\nAll sections are ASCII-safe and within budget.');
}

function preview(
  config: Config,
  resume: ResumeSections,
  options: { section?: string; color: boolean },
): void {
  const requested = options.section === undefined ? [...SECTION_NAMES] : [options.section];

  for (const name of requested) {
    if (!isSectionName(name)) {
      throw new Error(`Unknown section "${name}". Use one of: ${SECTION_NAMES.join(', ')}.`);
    }
    const record = buildRecord(
      name,
      readSection(name, config.domain, resume),
      config.maxRecordBytes,
    );
    console.log(renderSection(record.strings, { color: options.color }));
    console.log();
  }
}

function printPublishPlan(config: Config, resume: ResumeSections): void {
  for (const { host, record } of buildAll(config, resume)) {
    console.log(
      `${host} TTL ${config.ttl} -> ${record.strings.length} string(s), ${record.bytes} bytes`,
    );
  }
  console.log('\nDry run: nothing was sent to Cloudflare.');
}

async function publish(config: Config, resume: ResumeSections): Promise<void> {
  // Checked before anything is built or sent, so an incomplete setup costs no request.
  const { token, zoneId } = requireCompleteSetup(process.env);
  const options = { token, zoneId, ttl: config.ttl };

  for (const { host, record } of buildAll(config, resume)) {
    const outcome = await publishRecord(options, host, record);
    console.log(`${outcome} ${host} (${record.bytes} bytes)`);
  }
}

/** Resolves the zone id from the token and writes it to `.env`, so it is never copied by hand. */
async function setup(config: Config): Promise<void> {
  if ((process.env.CLOUDFLARE_ZONE_ID ?? '') !== '') {
    console.log('CLOUDFLARE_ZONE_ID is already set; nothing to do.');
    return;
  }

  const zoneId = await resolveZoneId(requireToken(process.env), config.domain);
  writeFileSync(ENV_FILE, upsertEnv(readFileSync(ENV_FILE, 'utf8'), 'CLOUDFLARE_ZONE_ID', zoneId));
  process.env.CLOUDFLARE_ZONE_ID = zoneId;

  console.log(`Wrote CLOUDFLARE_ZONE_ID for ${config.domain} to ${ENV_FILE}.`);
}

/** Reads the records back from a public resolver and fails when they are not what was built. */
async function verify(
  config: Config,
  resume: ResumeSections,
  options: { attempts: number },
): Promise<void> {
  const built = buildAll(config, resume).map(({ host, record }) => ({ host, strings: record.strings }));
  const hosts = built.map(({ host }) => host);

  for (let attempt = 1; ; attempt++) {
    const drift = compareRecords(built, await resolveLive(hosts));

    if (drift.length === 0) {
      console.log(`All ${hosts.length} records match on ${RESOLVER_ADDRESS}.`);
      return;
    }

    if (attempt >= options.attempts) {
      const detail = drift.map(({ host, reason }) => `  - ${host}: ${reason}`).join('\n');
      throw new Error(`Not live on ${RESOLVER_ADDRESS} after ${attempt} attempt(s):\n${detail}`);
    }

    console.log(`Waiting for DNS (${drift.length} record(s) pending, attempt ${attempt})...`);
    await new Promise((resume) => setTimeout(resume, VERIFY_WAIT_MS));
  }
}

/** The whole flow: resolve the zone id if needed, check the content, publish, then prove it is live. */
async function ship(config: Config, resume: ResumeSections): Promise<void> {
  await setup(config);
  validate(config, resume);
  await publish(config, resume);
  await verify(config, resume, { attempts: VERIFY_ATTEMPTS });
}

function printRecordSummary(host: string, record: TxtRecord, config: Config): void {
  const longest = Math.max(...record.strings.map((value) => value.length));
  console.log(
    `${host.padEnd(34)} ${String(record.bytes).padStart(5)}/${config.maxRecordBytes} bytes` +
      `  ${record.strings.length} string(s), longest ${longest}`,
  );
}
