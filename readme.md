# Underbar

A GNOME Shell extension that lets windows cover the top bar instead of always
stopping below it.

The bar is never hidden and never animates — that is the point, and it is what
separates this from every auto-hide extension. It sits flat on the desktop,
fully visible over the wallpaper, and whatever you put in front of it wins.
Maximize a window and it uses the full height of the screen. Press Super and the
bar is back, because the overview always shows it.

- **UUID** `underbar@oyzmo.no`
- **Schema** `org.gnome.shell.extensions.underbar`
- **Target** GNOME Shell 50, Wayland

## What it actually changes

Two things about `Main.layoutManager.panelBox`, both put back by `disable()`:

1. **Where it lives in the actor tree.** Lowered, the bar becomes a child of
   `global.window_group` stacked directly above LayoutManager's background
   group — above the wallpaper, below every window. On Wayland this settles
   input too: GNOME 50's `_updateRegions()` computes struts and nothing else, so
   pointer events follow Clutter picking, which follows paint order.

   It is *not* moved below `window_group`, which is the obvious-looking move and
   is wrong: the wallpaper lives inside that group, pinned to the bottom, so the
   bar would be buried under it and invisible at all times.
2. **`affectsStruts` on its chrome record.** Dropping the strut is what lets a
   maximized window reach the top of the screen; the lowered layer is what stops
   that from looking broken.

Two states always override both: the **overview** (a lowered bar is below
`overviewGroup` and would simply vanish) and an **open panel menu** (menus are
parented straight onto `Main.uiGroup`, so one would hang in the air over a
buried bar).

## Settings

| Key | Default | Meaning |
| --- | --- | --- |
| `reserve-space` | `false` | Keep the bar's strut, i.e. stock GNOME window behaviour |
| `yield-to-above` | `true` | While the strut is kept, let Always-on-Top windows pass over the bar |
| `debug` | `false` | Log every raise/lower decision to the journal |

With `reserve-space` off — the default — the bar is permanently behind the
windows and `yield-to-above` is moot. With it on, nothing changes from stock
GNOME except that an Always-on-Top window overlapping the bar's strip lowers it.

## Development

```sh
./test/run-tests.sh          # schema, JS syntax, metadata, unit tests
gjs -m test/test-stack.js    # just the stacking logic
./install.sh                 # tests, then install to ~/.local/share/…
./bump.sh [patch|minor|major]
./pack.sh                    # builds dist/ zips
./mydebug.sh                 # turn on debug logging and tail the journal
```

`dev/probe-api.js` checks that every GObject signal and method the extension
connects to exists on the installed Meta/Shell typelibs:

```sh
GI_TYPELIB_PATH=/usr/lib64/mutter-18:/usr/lib64/gnome-shell \
  LD_LIBRARY_PATH=/usr/lib64/gnome-shell gjs -m dev/probe-api.js
```

### Known interaction

Opening Looking Glass (`Alt+F2`, `lg`) for the first time while the bar is
lowered logs one Clutter `CRITICAL`: its constructor does
`Main.uiGroup.set_child_below_sibling(this, Main.layoutManager.panelBox)`, and
the bar is not a uiGroup child at that moment. Looking Glass ends up at the top
of `uiGroup` instead of just under the bar. Cosmetic, developer tool only, and
it cannot be fixed from outside the shell.

All the interesting logic lives in `extension/lib/stack.js`, which imports
nothing from `gi://` or `resource:///` so it can be unit tested with plain
`gjs`. `extension.js` is signal wiring and two shell pokes, nothing more.

**Wayland has no extension hot-reload.** A code change only lands in a fresh
session — log out and back in. Verify through the unit tests and the journal,
not through restart-and-look loops.

Licence: GNU GPL v2 or later, see `LICENSE`.
