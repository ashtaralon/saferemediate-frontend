#!/usr/bin/env bash
#
# Verify every icon slug in components/topology-v0-2/aws-architecture-icons.ts
# actually resolves on the CDN.
#
# WHY THIS IS A SCRIPT AND NOT A TEST
# -----------------------------------
# A CI test must not depend on a third-party CDN being up — a network blip
# would fail the build for a reason that has nothing to do with the change.
# So the unit test asserts each slug is in a FROZEN verified set (catching
# typos and invented slugs offline), and this script is what you run to
# refresh that set against reality when adding a service.
#
# A 404 here means the slug does not exist. Do NOT substitute a lookalike
# icon to make it green: either find the real slug, or set `slug: null` and
# let the card render without a glyph.
#
# Usage:  ./scripts/verify-aws-icon-slugs.sh
# Exit:   0 = every slug returned 200; 1 = at least one did not.

# `-e` matters as much as `-u` here: without it this script once printed its
# "controls ok" line and carried on past an unbound-variable error, reporting
# nothing and exiting 0 — a sweep that verified zero slugs and looked like a
# pass. A verifier that can silently check nothing is worse than none.
set -euo pipefail

ICONS_FILE="components/topology-v0-2/aws-architecture-icons.ts"
CDN="https://thesvg.org/icons"

if [[ ! -f "$ICONS_FILE" ]]; then
  echo "error: run from the repo root (expected $ICONS_FILE)" >&2
  exit 1
fi

# Only quoted slug values on a `slug:` line. `slug: null` carries no quotes
# and is skipped, which is correct — there is nothing to verify.
#
# Read into an array WITHOUT `mapfile`: that is a bash 4 builtin and macOS
# ships bash 3.2, where it does not exist. This loop is portable to both.
SLUGS=()
while IFS= read -r slug; do
  [[ -n "$slug" ]] && SLUGS+=("$slug")
done < <(grep -oE 'slug: "[a-z0-9-]+"' "$ICONS_FILE" \
  | sed -E 's/slug: "([a-z0-9-]+)"/\1/' | sort -u)

if [[ ${#SLUGS[@]} -eq 0 ]]; then
  echo "error: parsed 0 slugs — the grep is stale, not the catalog" >&2
  exit 1
fi

echo "verifying ${#SLUGS[@]} distinct slugs against $CDN"

# Positive/negative control first. If a known-good slug 404s or a known-bad
# slug 200s, the CDN is not answering the way this script assumes and every
# result below is meaningless.
# `|| echo 000` on every curl: without it, `set -e` turns one network blip into
# an abort with no per-slug report. 000 is not 200, so it fails loudly instead.
ctl_good=$(curl -s -o /dev/null -w '%{http_code}' -L --max-time 15 \
  "$CDN/aws-amazon-ec2/default.svg" || echo 000)
ctl_bad=$(curl -s -o /dev/null -w '%{http_code}' -L --max-time 15 \
  "$CDN/aws-this-slug-does-not-exist-control/default.svg" || echo 000)
if [[ "$ctl_good" != "200" || "$ctl_bad" == "200" ]]; then
  echo "error: CDN controls failed (known-good=$ctl_good known-bad=$ctl_bad);" \
       "results would be untrustworthy" >&2
  exit 1
fi
echo "controls ok (known-good=200 known-bad=$ctl_bad)"

fail=0
for slug in "${SLUGS[@]}"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' -L --max-time 20 \
    "$CDN/$slug/default.svg" || echo 000)
  if [[ "$code" == "200" ]]; then
    printf '  ok   %s\n' "$slug"
  else
    printf '  FAIL %s (HTTP %s)\n' "$slug" "$code"
    fail=1
  fi
done

if [[ $fail -ne 0 ]]; then
  echo
  echo "at least one slug did not resolve. Find the real slug or set" \
       "\`slug: null\` — do not substitute a lookalike." >&2
  exit 1
fi

echo
echo "all ${#SLUGS[@]} slugs resolved."
