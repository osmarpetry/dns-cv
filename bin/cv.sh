#!/usr/bin/env sh
#
# Reads a CV section published as a DNS TXT record and prints it.
#
# The DNS answer is untrusted input. It is never evaluated, sourced or passed to
# a shell: control bytes are stripped and the only escape sequences printed are
# the colours this script decides on, from the shape of each line.

set -eu

DIG=${DIG:-dig}

usage() {
  cat >&2 <<'USAGE'
Usage: cv.sh [--plain|--color] <hostname>

  --plain   never colourize (the default when stdout is not a terminal)
  --color   colourize even when piped

Example: cv.sh cv.osmarpetry.dev
USAGE
  exit 2
}

color=auto
host=

while [ $# -gt 0 ]; do
  case $1 in
    --plain) color=never ;;
    --color) color=always ;;
    -h | --help) usage ;;
    -*) printf 'Unknown option: %s\n' "$1" >&2; usage ;;
    *)
      if [ -n "$host" ]; then usage; fi
      host=$1
      ;;
  esac
  shift
done

[ -n "$host" ] || usage

if ! command -v "$DIG" >/dev/null 2>&1; then
  printf '%s not found. Install a DNS client (bind-utils / dnsutils) or set DIG.\n' "$DIG" >&2
  exit 127
fi

if ! answer=$("$DIG" +short TXT "$host"); then
  printf 'Query for %s failed. Is the resolver reachable?\n' "$host" >&2
  exit 1
fi

if [ -z "$answer" ]; then
  printf 'No TXT record at %s.\n' "$host" >&2
  exit 1
fi

if [ "$(printf '%s\n' "$answer" | wc -l)" -gt 1 ]; then
  printf 'Warning: %s has more than one TXT record; showing the first.\n' "$host" >&2
  answer=$(printf '%s\n' "$answer" | head -n 1)
fi

if [ "$color" = auto ]; then
  if [ -t 1 ] && [ "${NO_COLOR:-}" = "" ]; then color=always; else color=never; fi
fi

esc=$(printf '\033')

# Colour is decided when the CV is published and travels as the literal
# characters \033[...m. Only that exact shape is turned back into an escape:
# a hyperlink, a cursor move or a screen wipe stays harmless text.
if [ "$color" = always ]; then
  markers="s/\\\\033\[\([0-9;]*\)m/${esc}[\1m/g"
else
  markers="s/\\\\033\[[0-9;]*m//g"
fi

# 1. join the quoted 255-byte strings, 2. drop every control byte that arrived
# from the network, 3. undo the doubling DNS presentation format adds,
# 4. expand the colour markers, 5. turn the \n markers into real line breaks.
printf '%s\n' "$answer" |
  sed -e 's/^"//' -e 's/"$//' -e 's/" "//g' |
  tr -d '\000-\037\177' |
  sed -e 's/\\\\/\\/g' |
  sed -e "$markers" |
  awk '{ gsub(/\\n/, "\n"); print }'
