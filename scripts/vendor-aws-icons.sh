#!/usr/bin/env bash
#
# Fetch every icon the topology catalog names into public/aws-icons/, ONCE, on a connected
# workstation, and commit the result. The customer-resident image serves them from there; a
# closed VPC reaches no CDN, and a map that draws only when a CDN answers is not a map.
#
# The icons are the official AWS Architecture Icons as published by thesvg.org (CC BY-ND 4.0):
# they are copied unchanged, and public/aws-icons/ATTRIBUTION.txt records the source and licence.
# Nothing here invents an icon: a slug that does not resolve is left missing, and
# scripts/check-aws-icons-vendored.mjs then fails the image build by name until the catalog is
# corrected (set `slug: null` for a type with no official icon).
#
# Usage:  ./scripts/vendor-aws-icons.sh
# Exit:   0 = every slug fetched; 1 = at least one did not resolve (listed).
set -euo pipefail

ICONS_FILE="components/topology-v0-2/aws-architecture-icons.ts"
CDN="https://thesvg.org/icons"
OUT="public/aws-icons"

[[ -f "$ICONS_FILE" ]] || { echo "not at the repository root ($ICONS_FILE not found)" >&2; exit 2; }
mkdir -p "$OUT"
slugs="$(grep -oE '^\s*slug: "[a-z0-9-]+"' "$ICONS_FILE" | sed -E 's/.*"([a-z0-9-]+)"/\1/' | sort -u)"
[[ -n "$slugs" ]] || { echo "no slug found in $ICONS_FILE" >&2; exit 2; }

failed=()
while IFS= read -r slug; do
  target="$OUT/$slug.svg"
  if curl -fsSL --max-time 30 "$CDN/$slug/default.svg" -o "$target.part"; then
    mv "$target.part" "$target"
    printf 'fetched %s\n' "$slug"
  else
    rm -f "$target.part"
    failed+=("$slug")
  fi
done <<< "$slugs"

cat > "$OUT/ATTRIBUTION.txt" <<TXT
AWS Architecture Icons, as published by theSVG (https://thesvg.org/icons), licence CC BY-ND 4.0
(https://creativecommons.org/licenses/by-nd/4.0/). Copied unchanged by scripts/vendor-aws-icons.sh
from $CDN/<slug>/default.svg. AWS and the AWS architecture icons are trademarks of Amazon.com, Inc.
or its affiliates; their use here is nominative, to draw a customer's own AWS resources.
TXT

if (( ${#failed[@]} )); then
  printf 'did not resolve (%d): %s\n' "${#failed[@]}" "${failed[*]}" >&2
  exit 1
fi
printf 'every catalog icon is in %s\n' "$OUT"
