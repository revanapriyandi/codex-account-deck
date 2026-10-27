#!/usr/bin/env bash
set -euo pipefail
revision="${1:?Supply the full source commit SHA}"
[[ "$revision" =~ ^[a-f0-9]{40}$ ]] || { echo 'Invalid commit SHA' >&2; exit 2; }
if [[ "${2:-}" != sanitized ]]; then
  exec env -i HOME="$HOME" PATH="$PATH" LANG=C.UTF-8 bash "$0" "$revision" sanitized
fi
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 GIT_TERMINAL_PROMPT=0
build_root="$(mktemp -d "$HOME/account-deck-build-XXXXXXXX")"
git clone --quiet --depth 1 https://github.com/revanapriyandi/codex-account-deck.git "$build_root/source"
cd "$build_root/source"
git fetch --quiet origin "$revision"
git checkout --quiet --detach "$revision"
node scripts/audit-publication.cjs
npm test | tee "$build_root/portable-tests.txt"
npm run build:release
cp "$build_root/portable-tests.txt" dist/portable-tests.txt
printf 'ACCOUNT_DECK_BUILD_ROOT=%s\n' "$build_root/source/dist"
