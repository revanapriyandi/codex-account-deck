#!/usr/bin/env bash
set -euo pipefail
if command -v makensis >/dev/null 2>&1; then
  export DECK_MAKENSIS="$(command -v makensis)"
else
  tools_root="$(mktemp -d "${TMPDIR:-/tmp}/account-deck-nsis-XXXXXXXX")"
  mkdir -p "$tools_root/lists/partial" "$tools_root/cache/archives/partial" "$tools_root/packages" "$tools_root/toolchain"
  apt_options=(-o "Dir::State::lists=$tools_root/lists" -o "Dir::Cache=$tools_root/cache" -o Debug::NoLocking=1)
  apt-get "${apt_options[@]}" update -qq
  (cd "$tools_root/packages" && apt-get "${apt_options[@]}" download nsis nsis-common)
  for package in "$tools_root/packages/"*.deb; do
    dpkg-deb -x "$package" "$tools_root/toolchain"
  done
  export NSISDIR="$tools_root/toolchain/usr/share/nsis"
  export DECK_MAKENSIS="$tools_root/toolchain/usr/bin/makensis"
fi
node scripts/build-release.cjs
