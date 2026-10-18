/* Underbar -- let windows cover the top bar instead of stopping below it.
 * Copyright (C) 2026 oyzmo <http://oyzmo.no>
 *
 * This program is free software; you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation; either version 2 of the License, or (at your option)
 * any later version. See the LICENSE file for the full text.
 */

/* ---------------------------------------------------------------------------
 * Note for extensions.gnome.org reviewers
 *
 * This extension spawns nothing, opens no file, and makes no network call. It
 * changes exactly two things about Main.layoutManager.panelBox and puts both
 * back in disable():
 *
 *   1. its place in the actor tree. While lowered the bar is a child of
 *      global.window_group, stacked directly above LayoutManager's background
 *      group, so every window paints over it and the wallpaper does not. The
 *      shell does the same thing with its own St widgets -- TilePreview and the
 *      window cycler's highlight are both St actors living in window_group.
 *   2. the affectsStruts flag on the chrome record LayoutManager already keeps
 *      for it, so a maximized window can use the full height of the screen.
 *
 * (2) touches two private members of LayoutManager -- _trackedActors and
 * _queueUpdateRegions() -- because the public path, removeChrome() plus
 * addChrome(), unparents the panel and then throws on the re-track
 * ("trying to re-track existing chrome actor"). Flipping the flag in place is
 * the smaller intervention. The original value is read at enable() and written
 * back at disable(), rather than assumed.
 *
 * Extension page: https://oyzmo.no/apps/
 * -------------------------------------------------------------------------*/

import GLib from 'gi://GLib';
import Meta from 'gi://Meta';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {
    Layer, decideLayer, decideStruts, needsWindowWatch, aboveWindowOverlaps, describe,
} from './lib/stack.js';

export default class UnderbarExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._openMenus = new Set();
        this._windowIds = new Map();
        this._watchingWindows = false;
        this._aboveOverlaps = false;
        this._inOverview = Main.overview.visible;
        this._layer = Layer.RAISED;
        this._applyLater = 0;

        /* Where the bar sat before we touched anything. addChrome() puts it
         * directly below global.top_window_group, but later chrome goes in
         * below that too and pushes it down, and another extension may have
         * moved it again -- so remember the actual sibling rather than
         * recomputing a "stock" position at disable() time. A null sibling
         * means it was uiGroup's topmost child, which is a position
         * set_child_below_sibling() cannot express. */
        this._stockSibling = Main.layoutManager.panelBox.get_next_sibling();
        this._stockWasTopmost = this._stockSibling === null;
        this._stockStruts = this._panelChrome()?.affectsStruts ?? true;

        this._settings.connectObject(
            'changed', () => this._onSettingsChanged(), this);
        Main.overview.connectObject(
            'showing', () => this._setOverview(true),
            'hidden', () => this._setOverview(false), this);

        /* A plain id rather than connectObject(): _unwatchWindows() drops every
         * global.display handler owned by `this`, and this one must outlive it. */
        this._restackedId = global.display.connect(
            'restacked', () => this._keepBelowWindows());

        this._watchPanelMenus();
        this._onSettingsChanged();
    }

    disable() {
        this._settings?.disconnectObject(this);
        Main.overview.disconnectObject(this);
        if (this._restackedId) {
            global.display.disconnect(this._restackedId);
            this._restackedId = 0;
        }
        this._unwatchPanelMenus();
        this._unwatchWindows();

        if (this._applyLater) {
            global.compositor.get_laters().remove(this._applyLater);
            this._applyLater = 0;
        }

        /* Put the shell back exactly as it was found, in the order that leaves
         * no intermediate frame with a full-height window under a raised bar. */
        this._raise();
        this._setStruts(this._stockStruts);

        this._settings = null;
        this._openMenus = null;
        this._windowIds = null;
        this._stockSibling = null;
    }

    /* ------------------------------------------------------------ decisions */

    _state() {
        return {
            inOverview: this._inOverview,
            menuOpen: this._openMenus.size > 0,
            reserveSpace: this._settings.get_boolean('reserve-space'),
            yieldToAbove: this._settings.get_boolean('yield-to-above'),
            aboveOverlaps: this._aboveOverlaps,
        };
    }

    _onSettingsChanged() {
        const state = this._state();

        this._setStruts(decideStruts(state));

        if (needsWindowWatch(state))
            this._watchWindows();
        else
            this._unwatchWindows();

        this._apply();
    }

    /* Never reparent from inside a signal handler. Moving the bar unmaps it,
     * and PopupMenu closes itself when its source actor unmaps (popupMenu.js,
     * notify::mapped) -- which emits open-state-changed straight back into
     * us, mid-removal. Sliding from one panel menu to the next did exactly
     * that: the manager closes the old menu before our handler has seen the
     * new one open, so we briefly count zero menus and lower, the lowering
     * closes the new menu, and the nested remove_child() aborts the shell
     * (clutter_actor_set_mapped: !CLUTTER_ACTOR_IN_MAP_UNMAP).
     *
     * So every request is coalesced into one BEFORE_REDRAW later: it runs
     * after the emission has settled -- in the menu switch it sees the new
     * menu open and does nothing -- and still before the next paint, so the
     * overview cannot flash. */
    _apply() {
        if (this._applyLater)
            return;
        this._applyLater = global.compositor.get_laters().add(
            Meta.LaterType.BEFORE_REDRAW, () => {
                this._applyLater = 0;
                this._applyNow();
                return GLib.SOURCE_REMOVE;
            });
    }

    _applyNow() {
        const state = this._state();
        const want = decideLayer(state, this._layer);

        if (want === this._layer)
            return;

        if (want === Layer.LOWERED)
            this._lower();
        else if (want === Layer.LIFTED)
            this._lift();
        else
            this._raise();

        /* _lower() and _lift() refuse if the bar is not where they expect it.
         * Log what happened, not what was wanted -- and leave _layer alone so
         * the next event tries again. */
        if (this._layer === want)
            this._log(describe(state, want));
    }

    _setOverview(inOverview) {
        this._inOverview = inOverview;
        this._apply();
    }

    /* ------------------------------------------------------------- stacking */

    /* The wallpaper is not a sibling of the windows -- LayoutManager's
     * background group lives *inside* global.window_group, pinned to the
     * bottom. So "put the bar below the windows" cannot mean "below
     * window_group": that buries it under the wallpaper and the bar is then
     * invisible at all times, which is the opposite of the point. It means
     * joining window_group directly above the background instead. */
    _lower() {
        const lm = Main.layoutManager;
        const panel = lm.panelBox;
        const background = lm._backgroundGroup;

        if (!background || background.get_parent() !== global.window_group) {
            this._log('no background group to sit above, leaving the bar on top');
            return;
        }

        if (panel.get_parent() !== global.window_group) {
            panel.get_parent()?.remove_child(panel);
            global.window_group.add_child(panel);
        }
        global.window_group.set_child_above_sibling(panel, background);

        this._layer = Layer.LOWERED;
    }

    /* Mutter only keeps its own window actors in order. When they fall out of
     * sequence -- any time an older window is raised -- sync_actor_stacking()
     * (compositor.c) lowers every window to the bottom and then the background
     * below them, which leaves any other child of window_group, the bar
     * included, on top of all the windows. Its own comment: "it's up to a
     * plugin to try and keep them stacked correctly". The stack tracker emits
     * 'restacked' straight after that sync and before the next paint, so
     * putting the bar back here cannot flash. */
    _keepBelowWindows() {
        if (this._layer !== Layer.LOWERED)
            return;

        const panel = Main.layoutManager.panelBox;
        if (panel.get_parent() === global.window_group &&
            panel.get_previous_sibling() === Main.layoutManager._backgroundGroup)
            return;

        this._lower();
        this._log('mutter restacked the windows under the bar, lowered it again');
    }

    /* An open panel menu wants the bar above the windows, but a reparent would
     * unmap the menu's source button and PopupMenu would close itself on the
     * spot (popupMenu.js, notify::mapped). So stay inside window_group and go
     * to the top of it -- a restack within one parent keeps the bar mapped.
     * _lower() then undoes it the same way, without a reparent either. */
    _lift() {
        const panel = Main.layoutManager.panelBox;

        if (panel.get_parent() !== global.window_group) {
            this._log('bar is not in window_group, cannot lift it in place');
            return;
        }

        global.window_group.set_child_above_sibling(panel, null);
        this._layer = Layer.LIFTED;
    }

    _raise() {
        const lm = Main.layoutManager;
        const panel = lm.panelBox;

        if (panel.get_parent() !== lm.uiGroup) {
            panel.get_parent()?.remove_child(panel);
            lm.uiGroup.add_child(panel);   // lands on top of uiGroup
        }

        const sibling = this._stockSibling;
        if (sibling && sibling.get_parent() === lm.uiGroup)
            lm.uiGroup.set_child_below_sibling(panel, sibling);
        else if (!this._stockWasTopmost)
            lm.uiGroup.set_child_below_sibling(panel, global.top_window_group);
        /* else it started as the topmost child, where add_child just put it */

        this._layer = Layer.RAISED;
    }

    /* --------------------------------------------------------------- struts */

    _panelChrome() {
        const lm = Main.layoutManager;
        return lm._trackedActors?.find(data => data.actor === lm.panelBox) ?? null;
    }

    _setStruts(on) {
        const chrome = this._panelChrome();
        if (!chrome) {
            this._log('panelBox is not a tracked chrome actor, leaving struts alone');
            return;
        }
        if (chrome.affectsStruts === on)
            return;

        chrome.affectsStruts = on;
        Main.layoutManager._queueUpdateRegions();
        this._log(`strut ${on ? 'restored' : 'dropped'}`);
    }

    /* ---------------------------------------------------------- panel menus */

    /* Menus are parented onto Main.uiGroup directly (panelMenu.js), so they
     * float above a lowered bar with nothing beneath them. Track every menu the
     * panel's own manager knows about, and rescan when an indicator is added --
     * other extensions add theirs long after we enable. */
    _watchPanelMenus() {
        for (const box of this._panelBoxes()) {
            box.connectObject(
                'child-added', () => this._rescanPanelMenus(),
                'child-removed', () => this._rescanPanelMenus(), this);
        }
        this._rescanPanelMenus();
    }

    _unwatchPanelMenus() {
        for (const box of this._panelBoxes())
            box.disconnectObject(this);

        for (const menu of this._menus())
            menu.disconnectObject(this);

        this._openMenus?.clear();
    }

    _panelBoxes() {
        const panel = Main.panel;
        return [panel._leftBox, panel._centerBox, panel._rightBox].filter(b => !!b);
    }

    _menus() {
        return Main.panel.menuManager?._menus ?? [];
    }

    _rescanPanelMenus() {
        for (const menu of this._menus()) {
            /* connectObject is idempotent per (object, owner) pair only for the
             * same signal set, so disconnect first and reconnect the lot. */
            menu.disconnectObject(this);
            menu.connectObject(
                'open-state-changed', (_menu, open) => {
                    if (open)
                        this._openMenus.add(_menu);
                    else
                        this._openMenus.delete(_menu);
                    this._apply();
                },
                /* A menu destroyed while open would otherwise stay in the set
                 * for good and wedge the bar on top permanently. */
                'destroy', () => {
                    /* The manager drops it from _menus on destroy, so
                     * _unwatchPanelMenus() would never reach it again. */
                    menu.disconnectObject(this);
                    this._openMenus.delete(menu);
                    this._apply();
                }, this);

            if (menu.isOpen)
                this._openMenus.add(menu);
        }
        this._apply();
    }

    /* -------------------------------------------------------------- windows */

    /* Only wired up on the yield-to-above path; in the default configuration
     * (no strut) the answer never depends on where a window is. */
    _watchWindows() {
        if (this._watchingWindows)
            return;
        this._watchingWindows = true;

        global.display.connectObject(
            'restacked', () => this._refreshWindows(),
            'window-created', () => this._refreshWindows(),
            'grab-op-end', () => this._recompute(), this);
        global.window_manager.connectObject(
            'map', () => this._refreshWindows(),
            'destroy', () => this._refreshWindows(),
            'size-changed', () => this._recompute(), this);
        Main.layoutManager.panelBox.connectObject(
            'notify::allocation', () => this._recompute(), this);

        this._refreshWindows();
    }

    _unwatchWindows() {
        if (!this._watchingWindows)
            return;
        this._watchingWindows = false;

        global.display.disconnectObject(this);
        global.window_manager.disconnectObject(this);
        Main.layoutManager.panelBox.disconnectObject(this);

        for (const win of [...this._windowIds.keys()])
            this._forgetWindow(win, false);
        this._windowIds.clear();

        this._aboveOverlaps = false;
    }

    /* Every window is tracked, not just the Always-on-Top ones: notify::above
     * is how a window joins that set, and it only arrives on a window we are
     * already listening to. */
    _refreshWindows() {
        const live = new Set(this._liveActors().map(a => a.meta_window).filter(w => w));

        for (const win of [...this._windowIds.keys()]) {
            if (!live.has(win))
                this._forgetWindow(win, false);
        }

        for (const win of live) {
            if (this._windowIds.has(win))
                continue;

            const recompute = () => this._recompute();
            this._windowIds.set(win, [
                win.connect('position-changed', recompute),
                win.connect('size-changed', recompute),
                win.connect('notify::above', recompute),
                win.connect('notify::minimized', recompute),
                win.connect('unmanaged', () => this._forgetWindow(win)),
            ]);
        }

        this._recompute();
    }

    /* Disconnecting from a window that mutter has already finalised throws, and
     * 'unmanaged' is not guaranteed to have reached us first for every one of
     * them, so a failure here must not take the rest of the cleanup with it. */
    _forgetWindow(win, recompute = true) {
        const ids = this._windowIds?.get(win);
        if (!ids)
            return;

        this._windowIds.delete(win);
        for (const id of ids) {
            try {
                win.disconnect(id);
            } catch {
                break;
            }
        }

        if (recompute)
            this._recompute();
    }

    _recompute() {
        if (!this._watchingWindows)
            return;

        const overlaps = aboveWindowOverlaps(this._panelRect(), this._windowDescriptors());
        if (overlaps === this._aboveOverlaps)
            return;

        this._aboveOverlaps = overlaps;
        this._apply();
    }

    _panelRect() {
        const box = Main.layoutManager.panelBox;
        const [x, y] = box.get_transformed_position();
        const [width, height] = box.get_transformed_size();
        return {x, y, width, height};
    }

    /* A closing window's actor stays in the list for as long as its close
     * animation runs, after the window itself is unmanaged. Counting it would
     * reconnect handlers to a dead window and keep an overlap alive that no
     * later signal clears. */
    _liveActors() {
        return global.get_window_actors().filter(actor => !actor.is_destroyed());
    }

    _windowDescriptors() {
        return this._liveActors().map(actor => {
            const win = actor.meta_window;
            if (!win)
                return null;

            const rect = win.get_frame_rect();
            return {
                above: win.is_above(),
                minimized: win.minimized,
                visible: win.showing_on_its_workspace(),
                rect: {x: rect.x, y: rect.y, width: rect.width, height: rect.height},
            };
        }).filter(d => d !== null);
    }

    /* ---------------------------------------------------------------- debug */

    _log(message) {
        if (this._settings?.get_boolean('debug'))
            console.log(`[underbar] ${message}`);
    }
}
