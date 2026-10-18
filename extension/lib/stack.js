/* Underbar -- let windows cover the top bar instead of stopping below it.
 * Copyright (C) 2026 oyzmo <http://oyzmo.no>
 *
 * This program is free software; you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation; either version 2 of the License, or (at your option)
 * any later version. See the LICENSE file for the full text.
 */

/* Pure stacking decision.
 *
 * Deliberately free of any `gi://` or `resource:///` import so it can be unit
 * tested with plain gjs (see ../../test/test-stack.js). Everything the shell
 * knows -- the panel's allocation, the window list, the overview -- is reduced
 * to the plain object decideLayer() takes, so the interesting logic is
 * testable without a live session.
 *
 * Rectangles here are {x, y, width, height} in stage coordinates, which is what
 * both Clutter's get_transformed_position()/size() and Meta's get_frame_rect()
 * reduce to.
 */

export const Layer = {
    /* Stock: the bar paints above global.window_group, so nothing covers it. */
    RAISED: 'raised',
    /* Inside global.window_group, directly above the wallpaper and below every
     * window, so any window in front of the bar wins -- for paint order and, on
     * Wayland, for input too: GNOME 50's _updateRegions() computes struts and
     * nothing else, so pointer events follow Clutter picking, which follows
     * paint order. */
    LOWERED: 'lowered',
    /* Still inside global.window_group, but on top of it: above every window
     * without ever changing parent. This is how an open panel menu lifts a
     * lowered bar -- reparenting unmaps the bar, and a PopupMenu closes itself
     * the moment its source actor unmaps, so a reparent would close the very
     * menu it was meant to serve. */
    LIFTED: 'lifted',
};

export function rectsOverlap(a, b) {
    return a.x < b.x + b.width &&
           b.x < a.x + a.width &&
           a.y < b.y + b.height &&
           b.y < a.y + a.height;
}

/* Windows are {rect, above, minimized, visible}. Only the ones the user marked
 * Always on Top count -- everything else is handled by dropping the strut. */
export function aboveWindowOverlaps(panelRect, windows) {
    if (!panelRect || panelRect.width <= 0 || panelRect.height <= 0)
        return false;

    return windows.some(w =>
        w.above && w.visible && !w.minimized && rectsOverlap(panelRect, w.rect));
}

/* The whole extension in one function.
 *
 * The two overrides come first and are not negotiable:
 *
 *   - The overview. overviewGroup is chrome added *before* panelBox, so a
 *     lowered bar is below the overview's backdrop as well as below the
 *     windows, and would simply vanish when the overview opens.
 *   - An open panel menu. panelMenu.js parents menus straight onto
 *     Main.uiGroup, so they float above everything whatever we do to the bar.
 *     Leaving the bar buried under a window while its own menu hangs out of
 *     thin air looks broken, and Super+V / Super+S can open one at any time.
 *     The bar only has to get above the windows, though, and must not change
 *     parent to do it (see Layer.LIFTED) -- so a bar that is already RAISED
 *     stays put, and one inside window_group is LIFTED within it.
 *
 * `current` is the layer the bar is in now; only the menu override reads it.
 */
export function decideLayer(state, current = Layer.RAISED) {
    const {
        inOverview = false,
        menuOpen = false,
        reserveSpace = false,
        yieldToAbove = false,
        aboveOverlaps = false,
    } = state;

    if (inOverview)
        return Layer.RAISED;

    if (menuOpen)
        return current === Layer.RAISED ? Layer.RAISED : Layer.LIFTED;

    /* No strut: the bar is desktop furniture, permanently behind the windows. */
    if (!reserveSpace)
        return Layer.LOWERED;

    /* Strut kept: stock GNOME, except that Always-on-Top windows may pass. */
    if (yieldToAbove && aboveOverlaps)
        return Layer.LOWERED;

    return Layer.RAISED;
}

/* The panel's strut is what stops maximized windows at the bar. Dropping it is
 * the half of this extension that actually changes what windows can do; the
 * layer is what stops that from looking wrong. */
export function decideStruts(state) {
    return !!state.reserveSpace;
}

/* Watching every window's geometry is only worth doing when a window's
 * geometry can change the answer, which is the yield-to-above path alone. In
 * the default configuration this is false and nothing is connected. */
export function needsWindowWatch(state) {
    return !!state.reserveSpace && !!state.yieldToAbove;
}

/* One line for the journal, explaining the decision rather than restating it. */
export function describe(state, layer) {
    const why = state.inOverview ? 'overview open'
        : state.menuOpen ? 'panel menu open'
        : !state.reserveSpace ? 'no strut, bar lives under the windows'
        : state.yieldToAbove && state.aboveOverlaps ? 'an always-on-top window is over the bar'
        : 'strut kept and nothing is over the bar';

    return `${layer} -- ${why}`;
}
