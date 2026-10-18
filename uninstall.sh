#!/usr/bin/env bash
# Removes the extension from the current user's GNOME Shell.
# Run this yourself -- it touches the live session.
#
#   ./uninstall.sh            remove the extension, keep your settings
#   ./uninstall.sh --purge    also erase its dconf settings
set -euo pipefail
cd "$(dirname "$0")"

UUID=$(node -p 'require("./extension/metadata.json").uuid')
DEST="$HOME/.local/share/gnome-shell/extensions/$UUID"
# Derived from the schema id rather than written out again, so a rename cannot
# leave this pointing at the previous dconf path.
DCONF_PATH="/$(node -p 'require("./extension/metadata.json")["settings-schema"].replace(/\./g, "/")')/"

purge=0
case "${1:-}" in
    --purge) purge=1 ;;
    "") ;;
    *) echo "usage: $0 [--purge]" >&2; exit 1 ;;
esac

# Disable first so the shell runs disable() and puts the bar and its strut back
# while the files are still there; on a live session that is immediate.
if gnome-extensions list 2>/dev/null | grep -qx "$UUID"; then
    gnome-extensions disable "$UUID" 2>/dev/null || true
    echo "disabled $UUID"
else
    echo "$UUID is not installed for this user"
fi

if [ -d "$DEST" ]; then
    rm -rf "$DEST"
    echo "removed $DEST"
fi

if [ "$purge" -eq 1 ]; then
    dconf reset -f "$DCONF_PATH"
    echo "erased settings under $DCONF_PATH"
else
    echo "kept settings under $DCONF_PATH (use --purge to erase them)"
fi

cat <<'EOF'

Nothing outside GNOME's own session state is changed by this extension, so
there is nothing else to clean up: the top bar's strut and stacking are both
restored by disable(), and windows that were maximized over the bar are
re-maximized into the smaller work area by Mutter on the next layout pass.

On Wayland, log out and back in to fully unload the extension.
EOF
