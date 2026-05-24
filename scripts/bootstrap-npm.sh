#!/bin/sh
set -eu

NPM_VERSION="${NPM_VERSION:-10.9.2}"
TOOLS_DIR=".tools"
NPM_DIR="$TOOLS_DIR/npm"
ARCHIVE="/tmp/npm-$NPM_VERSION.tgz"

if [ -f "$NPM_DIR/bin/npm-cli.js" ]; then
  node "$NPM_DIR/bin/npm-cli.js" --version
  exit 0
fi

mkdir -p "$TOOLS_DIR"
curl -L "https://registry.npmjs.org/npm/-/npm-$NPM_VERSION.tgz" -o "$ARCHIVE"
tar -xzf "$ARCHIVE" -C "$TOOLS_DIR"
rm -rf "$NPM_DIR"
mv "$TOOLS_DIR/package" "$NPM_DIR"
node "$NPM_DIR/bin/npm-cli.js" --version

