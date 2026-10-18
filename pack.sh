#!/usr/bin/env bash
# Builds the distributable zips in dist/. Does not install or upload anything.
#
#   dist/underbar@oyzmo.no-<version>.shell-extension.zip
#       the extensions.gnome.org upload, built by `gnome-extensions pack`
#   dist/underbar-<version>-install.zip
#       the same extension for the website: unpacked UUID directory plus a
#       readable install.sh/uninstall.sh and README.txt from bundle/
#   dist/underbar-<version>-source.zip
#       the whole project under underbar-<version>/, minus build output, dev
#       scratch and tool caches
#
# Earlier versions' zips are cleared, so dist/ only ever holds the current one.
set -euo pipefail
cd "$(dirname "$0")"

./test/run-tests.sh

UUID=$(node -p 'require("./extension/metadata.json").uuid')
VERSION=$(tr -d '[:space:]' < VERSION)

mkdir -p dist
rm -f dist/*.shell-extension.zip dist/underbar-*install.zip dist/underbar-*-source.zip

cp LICENSE extension/LICENSE

gnome-extensions pack extension \
    --extra-source=lib \
    --extra-source=LICENSE \
    --schema=schemas/org.gnome.shell.extensions.underbar.gschema.xml \
    --force --out-dir=dist

rm -f extension/LICENSE

# `gnome-extensions pack` always names the zip after the UUID alone.
mv "dist/$UUID.shell-extension.zip" "dist/$UUID-$VERSION.shell-extension.zip"

# ---------------------------------------------------------------- website zip
# Self-hosted copies get an installer, because `gnome-extensions install` is not
# something a person who just wants their windows to cover the top bar should
# have to know about. The scripts live in bundle/ as real files rather than
# heredocs in here, so they can be read and syntax-checked on their own.
STAGE=dist/.bundle

rm -rf "$STAGE"
mkdir -p "$STAGE/$UUID"
cp -r extension/. "$STAGE/$UUID/"
rm -f "$STAGE/$UUID/schemas/gschemas.compiled"
cp LICENSE "$STAGE/$UUID/LICENSE"
cp bundle/install.sh bundle/uninstall.sh "$STAGE/"
chmod +x "$STAGE/install.sh" "$STAGE/uninstall.sh"
sed "s/@VERSION@/$VERSION/" bundle/README.txt > "$STAGE/README.txt"

(cd "$STAGE" && zip -qr "../underbar-$VERSION-install.zip" .)
rm -rf "$STAGE"

# ----------------------------------------------------------------- source zip
# Everything except what is generated or private to this machine. CLAUDE.md
# stays out: it is working notes, not documentation.
SRC=underbar-$VERSION

rm -rf "$STAGE"
mkdir -p "$STAGE/$SRC"
tar -c \
    --exclude=./dist --exclude=./dev --exclude=./.wrangler \
    --exclude=./CLAUDE.md --exclude=gschemas.compiled \
    . | tar -x -C "$STAGE/$SRC"
(cd "$STAGE" && zip -qr "../$SRC-source.zip" "$SRC")
rm -rf "$STAGE"

ls -l dist/
