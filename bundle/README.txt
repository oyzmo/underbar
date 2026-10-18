Underbar @VERSION@
==================

A GNOME Shell extension that lets windows cover the top bar, instead of always
stopping below it.

The bar is never hidden and never animates. It sits flat on the desktop, fully
visible over the wallpaper, and whatever you put in front of it wins. Maximize
a window and it uses the full height of the screen, bar included. Press Super
and the bar is back, because the overview always shows it.

That is the whole idea, and it is the opposite of the auto-hide extensions:
nothing slides, nothing peeks, nothing waits for a delay to expire.


INSTALL
-------

  ./install.sh

then log out and back in (GNOME Shell only loads new extension code in a fresh
session), and:

  gnome-extensions enable underbar@oyzmo.no

To remove it:

  ./uninstall.sh            keeps your settings
  ./uninstall.sh --purge    erases them too


SETTINGS
--------

  gnome-extensions prefs underbar@oyzmo.no

Reserve the bar's space
  Off by default. On, windows stop below the bar exactly as they do in stock
  GNOME, and only the option below can put one in front of it.

Let Always-on-Top windows pass over
  Only does anything while the space is reserved. GNOME's own "Always on Top"
  still loses to the top bar; this drops the bar behind such a window for as
  long as it overlaps. Useful for picture-in-picture video parked in a corner.

Log decisions to the journal
  For diagnosing. Read it with:

    journalctl --user -f -o cat | grep underbar


WHAT IT TOUCHES
---------------

Two things, both restored when the extension is disabled:

  * where the top bar sits in the shell's paint order, and
  * whether the bar reserves its strip of screen from maximized windows.

It spawns no process, opens no file, and makes no network call.


  Source and licence: GNU GPL v2 or later, see LICENSE.
  https://oyzmo.no/apps/
