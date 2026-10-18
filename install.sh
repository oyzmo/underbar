#!/usr/bin/env bash
# Installs the extension into the current user's GNOME Shell.
# Run this yourself -- it touches the live session.
set -euo pipefail
cd "$(dirname "$0")"

UUID=$(node -p 'require("./extension/metadata.json").uuid')
DEST="$HOME/.local/share/gnome-shell/extensions/$UUID"

./test/run-tests.sh

rm -rf "$DEST"
mkdir -p "$DEST"
cp -r extension/. "$DEST/"
glib-compile-schemas "$DEST/schemas/"

echo
echo "Installed $UUID to $DEST"
echo
echo "On Wayland a new extension is only picked up by a fresh session, so:"
echo "  1. log out and back in"
echo "  2. gnome-extensions enable $UUID"
echo "  3. gnome-extensions prefs $UUID"
echo
cat <<'EOF'
What you should see, with the default settings: maximize a window and it now
covers the top bar completely, using the full height of the screen. Press Super
and the bar is back, because the overview always raises it.

To watch it decide (takes effect immediately, no reload):

  dconf write /org/gnome/shell/extensions/underbar/debug true
  journalctl --user -f -o cat | grep underbar

A decision looks like:

  [underbar] strut dropped
  [underbar] lowered -- no strut, bar lives under the windows
  [underbar] raised -- overview open
EOF
