# dns-cv

An interactive CV published as DNS TXT records. Paste this into a terminal:

```bash
printf '%b\n' "$(dig +short TXT cv.osmarpetry.dev | sed -e 's/" "//g' -e 's/^"//' -e 's/"$//' -e 's/\\\\/\\/g')"
```

It prints the CV in colour and tells you which command to run next. No `eval`,
no pipe into a shell, nothing to install — the DNS answer is data for `printf`,
never a command.

Markdown in `content/` is compiled into DNS-safe TXT records, validated, and
published to Cloudflare. Colour is decided at build time and travels as text, so
no escape byte ever arrives from the network.

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
boundaries so a multi-byte character is never cut in half.

Content in `content/*.md` is validated at build time as plain ASCII with no
quotes, no backslashes and no control bytes. Only then does the build add two
kinds of marker, as ordinary text:

| In the record | Means |
| --- | --- |
| `\n` | a line break |
| `\033[1;36m` … `\033[0m` | a colour, chosen from the shape of the line |

**A real escape byte is never published.** `src/sgr.ts` decides colour at build
time from each line's shape — `# ` is a heading, `$ ` a command, `- ` a bullet,
`Label:` a label — and `assertOnlyColorMarkers` then proves that SGR colour and
`\n` are the only backslash sequences in the value. A sequence that could do
anything else — an OSC 8 hyperlink, a cursor move, a screen wipe — fails the
build and is never sent.

That is the whole security argument. Colour is worth having; the ability to
drive someone's terminal from a DNS record is not.

## Reading a record

Raw, on macOS and Linux:

```bash
dig +short TXT cv.osmarpetry.dev
```

Windows PowerShell:

```powershell
Resolve-DnsName -Type TXT cv.osmarpetry.dev | Select-Object -ExpandProperty Strings
```

Either way you get the 255-byte strings with the markers still literal. For the
readable version there are two options.

### One line, nothing to install

```bash
printf '%b\n' "$(dig +short TXT cv.osmarpetry.dev | sed -e 's/" "//g' -e 's/^"//' -e 's/"$//' -e 's/\\\\/\\/g')"
```

The `sed` joins the strings and undoes the doubling that DNS presentation format
adds; `printf '%b'` expands the markers. Note what is *not* there: no `eval`, no
`sh -c`, no pipe into a shell. The DNS answer is data for `printf`, never a
command.

`printf '%b'` will expand any backslash escape it is given, so this one-liner
trusts that the record is the one this repo published — which the build
guarantees. If you do not want to extend that trust, use the script.

### The script, safe even against a hijacked record

```bash
./bin/cv.sh cv.osmarpetry.dev
./bin/cv.sh --plain experience.cv.osmarpetry.dev
DIG=kdig ./bin/cv.sh contact.cv.osmarpetry.dev
```

`bin/cv.sh` never uses `eval`, `source` or `sh -c`. It strips every control byte
from the answer, then turns back into an escape *only* the exact shape
`\033[<digits and semicolons>m`. Anything else stays harmless text, so a
poisoned record can print the wrong colours and nothing more. `--plain` and
`NO_COLOR=1` turn colour off; it is off automatically when stdout is not a
terminal.

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

  printf '%b\n' "$(dig +short TXT cv.osmarpetry.dev | sed -e 's/" "//g' -e 's/^"//' -e 's/"$//' -e 's/\\\\/\\/g')"
```

Add a QR code to the normal web CV. Most recruiters do not have a terminal, do
not have `dig`, and should not be asked to run commands from a stranger. The DNS
CV is the hook for the ones who do — not a replacement for the real thing.
