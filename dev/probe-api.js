#!/usr/bin/gjs -m
/* Checks that every GObject signal and property extension.js connects to
 * actually exists on this GNOME's Meta/Shell typelibs. Type information only --
 * nothing here talks to a running shell.
 *
 * Run: GI_TYPELIB_PATH=/usr/lib64/gnome-shell gjs -m dev/probe-api.js
 */
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import Clutter from 'gi://Clutter';

let bad = 0;

function signals(gtype) {
    const found = new Set();
    for (let t = gtype; t && t !== GObject.TYPE_INVALID; t = GObject.type_parent(t)) {
        for (const id of GObject.signal_list_ids(t))
            found.add(GObject.signal_name(id));
        if (GObject.type_name(t) === 'GObject')
            break;
    }
    return found;
}

/* gjs will not hand out a GObjectClass with methods attached, so properties
 * cannot be listed from here. `above` and `minimized` were confirmed instead
 * from the typelib's string table and from the shell's own use of
 * notify::above / notify::minimized in workspaceAnimation.js. */

function check(label, have, want) {
    for (const name of want) {
        const ok = have.has(name);
        if (!ok)
            bad++;
        print(`${ok ? 'ok  ' : 'MISS'} ${label}: ${name}`);
    }
}

check('Meta.Display signal', signals(Meta.Display.$gtype),
    ['restacked', 'window-created', 'grab-op-end']);

check('Meta.Window signal', signals(Meta.Window.$gtype),
    ['position-changed', 'size-changed', 'unmanaged']);

check('Shell.WM signal', signals(Shell.WM.$gtype),
    ['map', 'destroy', 'size-changed', 'size-change']);

check('Clutter.Actor signal', signals(Clutter.Actor.$gtype),
    ['child-added', 'child-removed', 'destroy']);

for (const name of ['is_above', 'showing_on_its_workspace', 'get_frame_rect', 'get_monitor']) {
    const ok = typeof Meta.Window.prototype[name] === 'function';
    if (!ok)
        bad++;
    print(`${ok ? 'ok  ' : 'MISS'} Meta.Window method: ${name}`);
}

for (const name of ['set_child_below_sibling', 'set_child_above_sibling', 'get_next_sibling',
    'get_transformed_position', 'get_transformed_size', 'remove_child', 'add_child']) {
    const ok = typeof Clutter.Actor.prototype[name] === 'function';
    if (!ok)
        bad++;
    print(`${ok ? 'ok  ' : 'MISS'} Clutter.Actor method: ${name}`);
}

print('');
print(bad ? `${bad} MISSING` : 'all present');
if (bad)
    imports.system.exit(1);
