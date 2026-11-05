#!/usr/bin/env bash
# Builds the latest main in its own folder, switches to it, and goes back if it will not start.
# The live site keeps running during the build, so a failed build changes nothing.
set -euo pipefail

ROOT="$HOME/daari"
BRANCH=main
PORT=3111
export NEXT_TELEMETRY_DISABLED=1

exec 9>"$ROOT/deploy.lock"
flock 9

git -C "$ROOT/repo.git" fetch --quiet origin "+refs/heads/$BRANCH:refs/heads/$BRANCH"
SHA=$(git -C "$ROOT/repo.git" rev-parse "$BRANCH")
RELEASE="$ROOT/releases/$SHA"
PREVIOUS=$(readlink -f "$ROOT/current" || true)

if [ "$PREVIOUS" = "$RELEASE" ]; then
  echo "$SHA is already live"
  exit 0
fi

echo "Building $SHA"
rm -rf "$RELEASE"
mkdir -p "$RELEASE"
git -C "$ROOT/repo.git" archive "$SHA" | tar -x -C "$RELEASE"
# Keys and the spend log live outside the release, so they survive every deploy.
ln -s "$ROOT/shared/.env" "$RELEASE/.env"
ln -s "$ROOT/shared/.spend.jsonl" "$RELEASE/.spend.jsonl"
(cd "$RELEASE" && pnpm install --frozen-lockfile && pnpm build)

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

switch_to "$RELEASE"
if ! healthy; then
  echo "$SHA did not start"
  if [ -n "$PREVIOUS" ] && [ -d "$PREVIOUS" ]; then
    switch_to "$PREVIOUS"
    healthy && echo "Went back to $(basename "$PREVIOUS")"
  fi
  rm -rf "$RELEASE"
  exit 1
fi

install -m 755 "$RELEASE/deploy/deploy.sh" "$ROOT/deploy.sh"

# Keep the three newest releases, so there is always something recent to go back to.
ls -1dt "$ROOT"/releases/* | tail -n +4 | while read -r old; do
  [ "$old" = "$PREVIOUS" ] || rm -rf "$old"
done

echo "$SHA is live"
