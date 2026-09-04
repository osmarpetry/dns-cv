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

# 1. join the quoted 255-byte strings, 2. drop every control byte,
# 3. turn the literal \n markers into real line breaks.
printf '%s\n' "$answer" |
  sed -e 's/^"//' -e 's/"$//' -e 's/" "//g' |
  tr -d '\000-\037\177' |
  awk '{ gsub(/\\\\n/, "\n"); gsub(/\\n/, "\n"); print }' |
  awk -v color="$color" '
    BEGIN {
      esc = sprintf("%c", 27)
      reset = esc "[0m"
      heading = esc "[1;36m"
      bullet = esc "[33m"
      label = esc "[1m"
      command = esc "[32m"
    }
    color != "always" { print; next }
    /^# / { print heading substr($0, 3) reset; next }
    /^\$ / { print command $0 reset; next }
    /^- / { print bullet "-" reset " " substr($0, 3); next }
    /^[A-Za-z][A-Za-z0-9 .+_-]*: / {
      colon = index($0, ":")
      print label substr($0, 1, colon) reset substr($0, colon + 1)
      next
    }
    { print }
  '
