#!/usr/bin/env bash
# Underbar -- installer for the copy downloaded from https://oyzmo.no/apps/
#
# Everything this script does, in full:
#   1. copies underbar@oyzmo.no/ (next to this script) into
#      ~/.local/share/gnome-shell/extensions/
#   2. runs glib-compile-schemas on that directory's schemas/ folder
#   3. prints how to enable it
#
# It does not need root, touches nothing outside that one directory, downloads
# nothing, and changes no settings. Read it before you run it -- that is the
# point of shipping it as a readable script.
set -euo pipefail
cd "$(dirname "$0")"

UUID=underbar@oyzmo.no
DEST="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID"

if [ ! -d "$UUID" ]; then
    echo "error: $UUID/ is not next to this script." >&2
    echo "       Unpack the whole zip and run ./install.sh from inside it." >&2
    exit 1
fi

if ! command -v glib-compile-schemas >/dev/null 2>&1; then
    echo "error: glib-compile-schemas not found. It ships with glib2, which" >&2
    echo "       every GNOME system has -- something is unusual here." >&2
    exit 1
fi

rm -rf "$DEST"
mkdir -p "$DEST"
cp -r "$UUID/." "$DEST/"
glib-compile-schemas "$DEST/schemas/"

echo
echo "Installed $UUID"
echo "  -> $DEST"

cat <<'TXT'

GNOME Shell only loads new extension code in a fresh session, so:

  1. log out and back in
  2. gnome-extensions enable underbar@oyzmo.no
  3. gnome-extensions prefs  underbar@oyzmo.no

After step 2, maximize a window: it now covers the top bar and uses the full
height of the screen. Press Super and the bar is back -- the overview always
shows it. Step 3 is only needed if you would rather keep the bar's space
reserved and let just your Always-on-Top windows pass over it.

To remove it again, run ./uninstall.sh from this same folder.
TXT
