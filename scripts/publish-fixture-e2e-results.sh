#!/usr/bin/env bash
# Publish fixture screenshots onto fixture-e2e-results.
#
# Checkout the results branch in an empty directory, then copy the screenshots
# in. Copying them first leaves untracked files that match the branch, and a
# rerun of the same run id aborts with "untracked working tree files would be
# overwritten by checkout" (run 35943944649). The screenshots stay in a stage
# directory until that checkout has finished.
set -euo pipefail

: "${RESULTS_BRANCH:?}"
: "${RUN_DIR:?}"
: "${GITHUB_RUN_ID:?}"
: "${GITHUB_SHA:?}"
: "${GITHUB_REF_NAME:?}"
: "${GITHUB_SERVER_URL:?}"
: "${GITHUB_REPOSITORY:?}"

if [ -n "${RESULTS_REMOTE:-}" ]; then
  remote="$RESULTS_REMOTE"
else
  : "${GH_TOKEN:?}"
  remote="https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
fi

root="${PUBLISH_ROOT:-publish}"
stage="${SCREENSHOT_STAGE:-${root}.stage}"
mkdir -p "$stage" "$root"
stage_abs="$(cd "$stage" && pwd)"
root_abs="$(cd "$root" && pwd)"
rm -rf "$stage_abs" "$root_abs"
mkdir -p "${stage_abs}/${RUN_DIR}"

if [ -d test-results ]; then
  while IFS= read -r -d '' rel; do
    rel="${rel#./}"
    mkdir -p "${stage_abs}/${RUN_DIR}/$(dirname "$rel")"
    cp "test-results/${rel}" "${stage_abs}/${RUN_DIR}/${rel}"
  done < <(cd test-results && find . -type f \( -name '*.png' -o -name '*.json' -o -name '*.md' \) -print0)
fi

{
  echo "# fixture-e2e run ${GITHUB_RUN_ID}"
  echo
  echo "- head: ${GITHUB_SHA} (${GITHUB_REF_NAME})"
  echo "- run: ${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"
  echo "- published: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "${stage_abs}/${RUN_DIR}/README.md"

find "${stage_abs}/${RUN_DIR}" -type f | sort

mkdir -p "$root_abs"
cd "$root_abs"
git init -q
git config user.name "fixture-e2e"
git config user.email "fixture-e2e@users.noreply.github.com"
git config commit.gpgsign false
if git fetch -q "$remote" "$RESULTS_BRANCH" 2>/dev/null; then
  git checkout -q -b "$RESULTS_BRANCH" FETCH_HEAD
else
  git checkout -q --orphan "$RESULTS_BRANCH"
fi

mkdir -p "$RUN_DIR"
cp -a "${stage_abs}/${RUN_DIR}/." "${RUN_DIR}/"
printf '{ "ignoreCommand": "exit 0" }\n' > vercel.json
git add -A
git commit -q -m "fixture-e2e run ${GITHUB_RUN_ID}: ${GITHUB_SHA}"
for i in 1 2 3; do
  if git push -q "$remote" "HEAD:refs/heads/${RESULTS_BRANCH}"; then
    echo "published to ${RESULTS_BRANCH}/${RUN_DIR}"
    exit 0
  fi
  echo "push attempt ${i} failed; retrying"
  sleep $((i * 5))
  git fetch -q "$remote" "$RESULTS_BRANCH" && git rebase -q FETCH_HEAD || true
done
echo "::warning::results could not be pushed; the artifact still carries them"
