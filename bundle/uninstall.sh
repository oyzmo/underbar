#!/usr/bin/env bash
# Underbar -- remove the copy installed by ./install.sh
#
#   ./uninstall.sh            remove the extension, keep your settings
#   ./uninstall.sh --purge    also erase its settings from dconf
set -euo pipefail

UUID=underbar@oyzmo.no
DEST="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID"
DCONF_PATH="/org/gnome/shell/extensions/underbar/"

purge=0
case "${1:-}" in
    --purge) purge=1 ;;
    "") ;;
    *) echo "usage: $0 [--purge]" >&2; exit 1 ;;
esac

# Disable first, so the shell runs the extension's own cleanup -- which puts the
# top bar's stacking and its reserved space back -- while the files are still
# there. On a live session that happens immediately.
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

cat <<'TXT'

Nothing outside GNOME's own session state is changed by this extension, so
there is nothing else to clean up. Windows that were maximized over the bar
are re-maximized into the smaller work area on the next layout pass.

On Wayland, log out and back in to fully unload the extension.
TXT
