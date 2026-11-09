#!/usr/bin/env bash
# Runs every minute. When main has moved, it tests and builds the new commit in its own folder,
# switches to it, and goes back if it will not start. The live site runs throughout the build,
# so a failed test or build changes nothing.
set -euo pipefail

ROOT="$HOME/daari"
BRANCH=main
PORT=3111
export NEXT_TELEMETRY_DISABLED=1

exec 9>"$ROOT/deploy.lock"
flock -n 9 || exit 0

# The database lives in shared/, outside every release. Back it up at least once a day, even when
# nothing is deployed, keeping a week of copies.
DATABASE=$(sed -n 's/^DATABASE_PATH=//p' "$ROOT/shared/.env" | tail -n 1)
backup_db() {
  [ -n "$DATABASE" ] || return 0
  node "$1/deploy/backup-db.mjs" "$DATABASE" "$ROOT/backups" --keep=7 "${@:2}" 2>&1 | grep -v ExperimentalWarning | grep -v trace-warnings || true
}
[ -f "$ROOT/current/deploy/backup-db.mjs" ] && backup_db "$ROOT/current" --if-older-than-hours=24

git -C "$ROOT/repo.git" fetch --quiet origin "+refs/heads/$BRANCH:refs/heads/$BRANCH"
SHA=$(git -C "$ROOT/repo.git" rev-parse "$BRANCH")
RELEASE="$ROOT/releases/$SHA"
PREVIOUS=$(readlink -f "$ROOT/current" || true)

# Nothing new, or a commit that already failed: wait for the next push instead of retrying it.
[ "$PREVIOUS" != "$RELEASE" ] || exit 0
[ "$(cat "$ROOT/failed" 2>/dev/null)" != "$SHA" ] || exit 0

exec > >(tee -a "$ROOT/deploy.log") 2>&1
echo "=== $(date -u +%FT%TZ) building $SHA"

fail() {
  echo "$SHA" > "$ROOT/failed"
  rm -rf "$RELEASE"
  echo "=== FAILED $SHA: $1. The site is still on $(basename "$(readlink -f "$ROOT/current")")"
  exit 1
}

switch_to() {
  ln -sfn "$1" "$ROOT/current.next"
  mv -T "$ROOT/current.next" "$ROOT/current"
  sudo /usr/bin/systemctl restart daari
}

healthy() {
  for _ in $(seq 1 30); do
    curl -fsS -o /dev/null --max-time 5 "http://127.0.0.1:$PORT/" && return 0
    sleep 1
  done
  return 1
}

rm -rf "$RELEASE"
mkdir -p "$RELEASE"
git -C "$ROOT/repo.git" archive "$SHA" | tar -x -C "$RELEASE"
# Keys and the spend log live outside the release, so they survive every deploy.
ln -s "$ROOT/shared/.env" "$RELEASE/.env"
ln -s "$ROOT/shared/.spend.jsonl" "$RELEASE/.spend.jsonl"
(cd "$RELEASE" && pnpm install --frozen-lockfile && pnpm test && pnpm build) || fail "tests or build failed"

# A copy from just before the new code runs, so a migration that goes wrong can be undone.
backup_db "$RELEASE"
switch_to "$RELEASE"
if ! healthy; then
  if [ -n "$PREVIOUS" ] && [ -d "$PREVIOUS" ]; then
    switch_to "$PREVIOUS"
    healthy || echo "=== The previous version did not come back either"
  fi
  fail "it did not start"
fi

install -m 755 "$RELEASE/deploy/deploy.sh" "$ROOT/deploy.sh"

# Keep the three newest releases, so there is always something recent to go back to.
ls -1dt "$ROOT"/releases/* | tail -n +4 | while read -r old; do
  [ "$old" = "$PREVIOUS" ] || rm -rf "$old"
done

echo "=== $(date -u +%FT%TZ) $SHA is live"
