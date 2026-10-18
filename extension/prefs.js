/* Underbar -- let windows cover the top bar instead of stopping below it.
 * Copyright (C) 2026 oyzmo <http://oyzmo.no>
 *
 * This program is free software; you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation; either version 2 of the License, or (at your option)
 * any later version. See the LICENSE file for the full text.
 */

/* Three switches, no external calls, no file access -- everything here is
 * Gio.Settings.bind() onto the schema in schemas/. */

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class UnderbarPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: 'Underbar',
            icon_name: 'focus-top-bar-symbolic',
        });
        window.add(page);

        const bar = new Adw.PreferencesGroup({
            title: 'The bar',
            description: 'The top bar is never hidden and never animates. It stays where it is; ' +
                'what changes is whether windows are allowed in front of it.',
        });
        page.add(bar);

        const reserve = new Adw.SwitchRow({
            title: 'Reserve the bar’s space',
            subtitle: 'On, windows stop below the bar as they do in stock GNOME. ' +
                'Off, a maximized window gets the full height of the screen and covers it.',
        });
        bar.add(reserve);
        settings.bind('reserve-space', reserve, 'active', Gio.SettingsBindFlags.DEFAULT);

        const yieldRow = new Adw.SwitchRow({
            title: 'Let Always-on-Top windows pass over',
            subtitle: 'GNOME’s own “Always on Top” still loses to the top bar. ' +
                'This drops the bar behind such a window while it overlaps.',
        });
        bar.add(yieldRow);
        settings.bind('yield-to-above', yieldRow, 'active', Gio.SettingsBindFlags.DEFAULT);

        /* Only reachable while the strut is kept -- with no strut the bar is
         * already behind everything, always-on-top or not. */
        settings.bind('reserve-space', yieldRow, 'sensitive', Gio.SettingsBindFlags.GET);

        const troubleshooting = new Adw.PreferencesGroup({
            title: 'Troubleshooting',
        });
        page.add(troubleshooting);

        const debug = new Adw.SwitchRow({
            title: 'Log decisions to the journal',
            subtitle: 'journalctl --user -f -o cat | grep underbar',
        });
        troubleshooting.add(debug);
        settings.bind('debug', debug, 'active', Gio.SettingsBindFlags.DEFAULT);
    }
}
