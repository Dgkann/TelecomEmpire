#!/usr/bin/env bash
# Checks that every commit in a range compiles and builds on its own, not just
# the tip. Each commit is checked out into a throwaway worktree so the current
# working tree is never touched.
#
#   tools/verify-commits.sh                  # every commit not on origin/main
#   tools/verify-commits.sh main..HEAD       # an explicit range
#   tools/verify-commits.sh <sha>..HEAD
set -uo pipefail

RANGE="${1:-}"
if [ -z "$RANGE" ]; then
  if git rev-parse --verify --quiet origin/main >/dev/null; then
    RANGE="origin/main..HEAD"
  else
    RANGE="HEAD~1..HEAD"
  fi
fi

REPO_ROOT=$(git rev-parse --show-toplevel)
WORKTREE=$(mktemp -d)/verify
COMMITS=$(git rev-list --reverse "$RANGE")

if [ -z "$COMMITS" ]; then
  echo "no commits in range $RANGE"
  exit 0
fi

echo "verifying $(echo "$COMMITS" | wc -l | tr -d ' ') commit(s) in $RANGE"
failed=0

cleanup() {
  rm -f "$WORKTREE/node_modules" 2>/dev/null
  git worktree remove "$WORKTREE" --force >/dev/null 2>&1
}
trap cleanup EXIT

for sha in $COMMITS; do
  subject=$(git log --format=%s -1 "$sha")
  git worktree add -q --detach "$WORKTREE" "$sha" || { echo "could not check out $sha"; exit 1; }

  # Reuse the installed dependencies rather than reinstalling per commit.
  ln -s "$REPO_ROOT/node_modules" "$WORKTREE/node_modules" 2>/dev/null \
    || cp -r "$REPO_ROOT/node_modules" "$WORKTREE/node_modules"

  if (cd "$WORKTREE" && npx tsc --noEmit -p tsconfig.json >/dev/null 2>&1 && npx vite build >/dev/null 2>&1); then
    printf 'pass  %s  %s\n' "${sha:0:7}" "$subject"
  else
    printf 'FAIL  %s  %s\n' "${sha:0:7}" "$subject"
    failed=1
  fi

  rm -f "$WORKTREE/node_modules" 2>/dev/null
  git worktree remove "$WORKTREE" --force >/dev/null 2>&1
done

trap - EXIT
git worktree prune

if [ "$failed" -ne 0 ]; then
  echo "at least one commit does not build on its own"
  exit 1
fi
echo "every commit builds on its own"
