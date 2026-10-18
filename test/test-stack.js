#!/usr/bin/gjs -m
/* Unit tests for the pure stacking logic. Run: ./test/run-tests.sh
 *
 * The rectangles below are in the shape the shell hands over: stage coordinates
 * from get_transformed_position()/size() for the bar, and from
 * MetaWindow.get_frame_rect() for the windows.
 */

import {
    Layer, rectsOverlap, aboveWindowOverlaps, decideLayer, decideStruts,
    needsWindowWatch, describe,
} from '../extension/lib/stack.js';

let failures = 0;
let checks = 0;

function ok(cond, what) {
    checks++;
    if (!cond) {
        failures++;
        print(`  FAIL  ${what}`);
    }
}

function eq(actual, expected, what) {
    ok(Object.is(actual, expected), `${what} -- expected ${expected}, got ${actual}`);
}

function suite(name, fn) {
    print(name);
    fn();
}

/* ---------------------------------------------------------------- fixtures */

/* A 2560x1440 primary monitor with GNOME's default 32px bar. */
const PANEL = {x: 0, y: 0, width: 2560, height: 32};

const win = (rect, extra = {}) => ({
    rect,
    above: false,
    minimized: false,
    visible: true,
    ...extra,
});

/* Maximized under the strut: starts exactly where the bar ends. */
const MAXIMIZED = win({x: 0, y: 32, width: 2560, height: 1408});
/* A picture-in-picture window parked in the top right, over the bar. */
const PIP = win({x: 2100, y: 8, width: 400, height: 225}, {above: true});
/* The same window, not marked Always on Top. */
const PIP_NOT_ABOVE = win({x: 2100, y: 8, width: 400, height: 225});

/* ------------------------------------------------------------------- tests */

suite('rectsOverlap', () => {
    ok(rectsOverlap(PANEL, {x: 100, y: 0, width: 10, height: 10}),
        'a window inside the bar strip overlaps');
    ok(!rectsOverlap(PANEL, {x: 0, y: 32, width: 100, height: 100}),
        'a window starting at the bar’s bottom edge does not overlap');
    ok(!rectsOverlap(PANEL, {x: 0, y: 100, width: 100, height: 100}),
        'a window well below the bar does not overlap');
    ok(rectsOverlap(PANEL, {x: -50, y: -50, width: 5000, height: 5000}),
        'a rect swallowing the bar overlaps');
    ok(!rectsOverlap(PANEL, {x: 2560, y: 0, width: 100, height: 100}),
        'a window starting at the bar’s right edge does not overlap');
});

suite('aboveWindowOverlaps', () => {
    ok(aboveWindowOverlaps(PANEL, [MAXIMIZED, PIP]),
        'an always-on-top window over the bar counts');
    ok(!aboveWindowOverlaps(PANEL, [MAXIMIZED, PIP_NOT_ABOVE]),
        'the same window without Always on Top does not');
    ok(!aboveWindowOverlaps(PANEL, [MAXIMIZED]),
        'a maximized window held off by the strut does not');
    ok(!aboveWindowOverlaps(PANEL, [{...PIP, minimized: true}]),
        'a minimized always-on-top window does not');
    ok(!aboveWindowOverlaps(PANEL, [{...PIP, visible: false}]),
        'an always-on-top window on another workspace does not');
    ok(!aboveWindowOverlaps(PANEL, []),
        'an empty desktop does not');
    ok(!aboveWindowOverlaps({x: 0, y: 0, width: 2560, height: 0}, [PIP]),
        'a bar with no height yet never counts as covered');
    ok(!aboveWindowOverlaps(null, [PIP]),
        'no panel rect at all is handled');
});

suite('decideLayer -- the overrides win', () => {
    eq(decideLayer({inOverview: true}), Layer.RAISED,
        'the overview always raises the bar (it is below overviewGroup when lowered)');
    eq(decideLayer({inOverview: true, reserveSpace: false}), Layer.RAISED,
        'the overview beats a dropped strut');
    eq(decideLayer({menuOpen: true, reserveSpace: false}), Layer.RAISED,
        'an open panel menu beats a dropped strut');
    eq(decideLayer({inOverview: true, menuOpen: true}), Layer.RAISED,
        'both at once still raises');
});

suite('decideLayer -- a menu never reparents the bar', () => {
    const menu = {menuOpen: true, reserveSpace: false};
    eq(decideLayer(menu, Layer.LOWERED), Layer.LIFTED,
        'a menu opened from a lowered bar lifts it within window_group');
    eq(decideLayer(menu, Layer.LIFTED), Layer.LIFTED,
        'a lifted bar stays lifted while the menu is open');
    eq(decideLayer(menu, Layer.RAISED), Layer.RAISED,
        'a bar already raised stays raised');
    eq(decideLayer({...menu, inOverview: true}, Layer.LIFTED), Layer.RAISED,
        'the overview still reparents a lifted bar -- window_group is hidden there');
    eq(decideLayer({reserveSpace: false}, Layer.LIFTED), Layer.LOWERED,
        'closing the menu lowers a lifted bar');
    eq(decideLayer({reserveSpace: true, yieldToAbove: true, aboveOverlaps: true, menuOpen: true},
        Layer.LOWERED), Layer.LIFTED,
        'the yield-to-above path lifts rather than reparents too');
});

suite('decideLayer -- desktop furniture (no strut)', () => {
    eq(decideLayer({reserveSpace: false}), Layer.LOWERED,
        'with no strut the bar lives under the windows');
    eq(decideLayer({reserveSpace: false, aboveOverlaps: false}), Layer.LOWERED,
        'even with nothing over it -- there is no point raising and lowering per window');
    eq(decideLayer({reserveSpace: false, yieldToAbove: false}), Layer.LOWERED,
        'yield-to-above is moot without a strut');
});

suite('decideLayer -- strut kept', () => {
    eq(decideLayer({reserveSpace: true, yieldToAbove: false, aboveOverlaps: true}), Layer.RAISED,
        'strut kept and yielding off is stock GNOME');
    eq(decideLayer({reserveSpace: true, yieldToAbove: true, aboveOverlaps: false}), Layer.RAISED,
        'nothing over the bar, so the bar stays on top');
    eq(decideLayer({reserveSpace: true, yieldToAbove: true, aboveOverlaps: true}), Layer.LOWERED,
        'an always-on-top window over the bar lowers it');
});

suite('decideLayer -- an empty state is stock behaviour', () => {
    /* Everything defaults to false, which is reserveSpace: false -- so the
     * bare {} case must be LOWERED, not RAISED. Guards against a future
     * default flip going unnoticed. */
    eq(decideLayer({}), Layer.LOWERED, 'no state at all means no strut, so lowered');
});

suite('decideStruts', () => {
    eq(decideStruts({reserveSpace: true}), true, 'reserving space keeps the strut');
    eq(decideStruts({reserveSpace: false}), false, 'not reserving drops it');
    eq(decideStruts({}), false, 'missing means dropped');
});

suite('needsWindowWatch', () => {
    eq(needsWindowWatch({reserveSpace: true, yieldToAbove: true}), true,
        'the yield path needs window geometry');
    eq(needsWindowWatch({reserveSpace: false, yieldToAbove: true}), false,
        'the default configuration connects nothing');
    eq(needsWindowWatch({reserveSpace: true, yieldToAbove: false}), false,
        'stock behaviour connects nothing');
});

suite('describe', () => {
    const cases = [
        [{inOverview: true}, 'overview'],
        [{menuOpen: true}, 'menu'],
        [{reserveSpace: false}, 'strut'],
        [{reserveSpace: true, yieldToAbove: true, aboveOverlaps: true}, 'always-on-top'],
        [{reserveSpace: true}, 'nothing is over the bar'],
    ];
    for (const [state, fragment] of cases) {
        const line = describe(state, decideLayer(state));
        ok(line.includes(fragment), `"${line}" explains itself with "${fragment}"`);
        ok(line.startsWith(decideLayer(state)), `"${line}" names the layer first`);
    }
});

print('');
if (failures) {
    print(`${failures} failed out of ${checks} checks`);
    imports.system.exit(1);
} else {
    print(`all ${checks} checks passed`);
}
