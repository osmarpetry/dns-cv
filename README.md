# dns-cv

An interactive CV published as DNS TXT records.

```bash
dig +short TXT cv.osmarpetry.dev
```

Markdown in `content/` is compiled into DNS-safe TXT records, validated, and
published to Cloudflare. `bin/cv.sh` reads a record back and prints it with
colour — without ever executing what came off the network.

## Requirements

Node 22.18 or newer (TypeScript runs directly, there is no build step) and a DNS
client for reading. No runtime dependencies.

```bash
npm install   # typescript + @types/node, for `npm run typecheck` only
npm test
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run build:txt` | Writes `dist/records.json` and one `dist/<section>.txt` per section, ready to paste into any DNS UI |
| `npm run validate` | Encodes every section and reports its size against the record budget |
| `npm run preview -- --section home` | Renders a section in the terminal, exactly as a reader will see it |
| `npm run preview -- --plain` | Same, without colour |
| `npm run setup` | Resolves the zone id from your API token and writes `CLOUDFLARE_ZONE_ID` into `.env` |
| `npm run publish -- --dry-run` | Shows what would be sent to Cloudflare; makes no network call |
| `npm run publish` | Creates or updates the TXT records |
| `npm run verify` | Reads the records back from `1.1.1.1` and fails if they are not what was built |
| `npm run ship` | setup, validate, publish and verify in one run — the only command you normally need |
| `npm test` | Unit tests for setup, preflight, verification, chunking, encoding, rendering and `bin/cv.sh` |

Configuration comes from the environment (see `.env.example`):
`DNS_CV_DOMAIN`, `DNS_CV_TTL`, `DNS_CV_MAX_BYTES`.

## DNS layout

One record per section, so no single record has to carry the whole CV:

```
cv.osmarpetry.dev              intro and the commands that follow
experience.cv.osmarpetry.dev   roles
projects.cv.osmarpetry.dev     selected work
contact.cv.osmarpetry.dev      links and availability
```

`content/*.md` uses `{{domain}}` wherever the zone appears, so the same content
builds for any domain.

## The encoding, and why

A TXT record is a list of character-strings, each capped at 255 bytes
([RFC 1035 §3.3.14](https://www.rfc-editor.org/rfc/rfc1035.txt)); readers treat
the strings as one concatenated value. `src/txt.ts` chunks on character
boundaries so a multi-byte character is never cut in half, and line breaks are
stored as the two literal characters `\` + `n`.

Content is validated at build time as plain ASCII with no quotes, no
backslashes and no control bytes. That is what keeps the reader trivial: there
is no escaping to undo, and **no escape sequence can arrive from DNS at all**.

## Reading a record

macOS and Linux:

```bash
dig +short TXT cv.osmarpetry.dev
```

Windows PowerShell:

```powershell
Resolve-DnsName -Type TXT cv.osmarpetry.dev | Select-Object -ExpandProperty Strings
```

Either way you get the raw 255-byte strings. For the readable version:

```bash
./bin/cv.sh cv.osmarpetry.dev
./bin/cv.sh --plain experience.cv.osmarpetry.dev
DIG=kdig ./bin/cv.sh contact.cv.osmarpetry.dev
```

`bin/cv.sh` never uses `eval`, `source` or `sh -c`. It strips every control byte
from the answer and then applies its own colours based on line shape, so a
poisoned or hijacked record can print wrong text but cannot drive your terminal
or run anything. `--plain` and `NO_COLOR=1` turn colour off; it is off
automatically when stdout is not a terminal.

Do not pipe a URL into a shell to install this. Read the script first — that is
the whole point of the design.

## Publishing to Cloudflare

Creating the API token is the only manual step. Everything after it is one command.

```bash
cp .env.example .env      # already in .gitignore
```

Create the token at **My Profile → API Tokens → Create Token → Custom token**, with
the minimum it needs:

- Permissions: **Zone → DNS → Edit**
- Zone Resources: **Include → Specific zone → your zone only**

Paste it into `CLOUDFLARE_API_TOKEN` in `.env` and leave `CLOUDFLARE_ZONE_ID` empty:

```bash
npm run ship
```

`ship` resolves the zone id from the token and writes it to `.env`, validates every
section, publishes, and then reads the records back from `1.1.1.1` until they match —
so a green run means the CV is actually live, not merely that the API accepted it.

The token is read from the environment, is never logged, and is never included in
error messages.

### When something is missing

Nothing reaches the network until the setup is complete. `ship` and `publish` both
stop first and list every pending step at once:

```
Setup is incomplete:
  - Set CLOUDFLARE_API_TOKEN in .env. Create the token at My Profile > API Tokens > ...
  - Set CLOUDFLARE_ZONE_ID in .env by running `npm run setup`, which reads it from the API.
```

If `npm run setup` reports that no zone is visible to the token, the token was scoped
to the wrong zone or to the account rather than the zone — recreate it with the two
settings above. It never writes a guess into `.env`.

You do not need the zone id by hand. If you want to see it anyway, it is on the
domain's **Overview** page, in the **API** section at the bottom.

## Verifying after publishing

```bash
npm run verify
```

It compares the live records against the built ones on `1.1.1.1`, joining the
255-byte strings before comparing, and ignoring unrelated TXT records on the same
host. It exits non-zero on any difference and says which host and why.

The same by hand:

```bash
dig +short TXT cv.osmarpetry.dev
dig @1.1.1.1 +short TXT cv.osmarpetry.dev
./bin/cv.sh cv.osmarpetry.dev
```

Query a second resolver, or a different network, before assuming something is
broken: caches hold the old answer until the previous TTL expires. That is why
`ship` retries for a while instead of failing on the first look.

## Business card

```
Osmar Petry - Senior Product Engineer
osmarpetry.dev

  dig +short TXT cv.osmarpetry.dev
```

Add a QR code to the normal web CV. Most recruiters do not have a terminal, do
not have `dig`, and should not be asked to run commands from a stranger. The DNS
CV is the hook for the ones who do — not a replacement for the real thing.
