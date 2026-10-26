<h1 align="center">Eureka</h1>

<p align="center">
  <b>Spotlight-style search for GNOME 50.</b><br>
  Press <kbd>Super</kbd> + <kbd>Space</kbd>, type, press <kbd>Enter</kbd>. Press it again to close.
</p>

<p align="center">
  <img alt="GNOME 50" src="https://img.shields.io/badge/GNOME-50-4A86CF?logo=gnome&logoColor=white">
  <img alt="Licence GPL-2.0-or-later" src="https://img.shields.io/badge/licence-GPL--2.0--or--later-blue">
  <img alt="No network access" src="https://img.shields.io/badge/network-none-2ea44f">
</p>

<p align="center">
  <img src="docs/demo.gif" width="620" alt="Eureka: suggested apps, typing “firefox”, Lock Screen as top hit, a sum, a unit conversion, an emoji and a YouTube search">
</p>

*Eureka!* is Greek for "I found it!", what Archimedes shouted in his bath. That is the moment this extension is for:
one box that finds your apps, windows, files, emoji and settings, does quick maths and conversions, and searches the
web, with a Material You look that follows your accent colour.

## Install

**Easiest: Extension Manager or extensions.gnome.org.** Open the *Extension Manager* app (or
[extensions.gnome.org](https://extensions.gnome.org)), search for **Eureka**, click **Install**. Done.

**From GitHub:** download `eureka@shahriyar31.github.io.shell-extension.zip` from the
[latest release](https://github.com/Shahriyar31/eureka/releases/latest), then:

```bash
gnome-extensions install --force eureka@shahriyar31.github.io.shell-extension.zip
```

Log out and back in (GNOME loads new extensions at login), then:

```bash
gnome-extensions enable eureka@shahriyar31.github.io
```

**Requires** GNOME Shell 50, for example Ubuntu 26.04.

## How to use it

1. Press <kbd>Super</kbd> + <kbd>Space</kbd> (the Windows-logo key and the space bar).
2. Type. Results appear as you type, grouped by kind.
3. Press <kbd>Enter</kbd> to open the highlighted result.

| You type | You get | <kbd>Enter</kbd> does |
|---|---|---|
| *(nothing yet)* | your most used apps | opens the app |
| `firefox`, `terminal` | applications | opens the app |
| part of a window title | open windows | switches to that window |
| `thesis`, a word inside a PDF | files (GNOME's file index) | opens the file |
| `smile`, `wifi`, `tokyo` | emoji, Settings pages, clocks, contacts, software… | the same results as GNOME's Activities search |
| `12*(3+4)/2`, `sqrt(2)`, `2^10` | calculator | copies the result |
| `10 km to mi`, `100 f to c`, `2 gib to mb` | unit converter (offline) | copies the result |
| `lock`, `suspend`, `restart`, `power off` | system actions | runs it (restart and power off ask first) |
| `yt lofi`, `w quantum`, `gh eureka` | YouTube, Wikipedia, GitHub… | opens the search in your browser |

Anything else gets a **Search the web** row at the bottom.

| Keys | |
|---|---|
| <kbd>↑</kbd> <kbd>↓</kbd> or <kbd>Tab</kbd> | move through results |
| <kbd>Alt</kbd> + <kbd>1</kbd> … <kbd>9</kbd> | open result 1 to 9 directly |
| <kbd>Ctrl</kbd> + <kbd>Enter</kbd> | show a file in the Files app instead of opening it |
| <kbd>Alt</kbd> + <kbd>Enter</kbd> | copy a file's path |
| <kbd>Esc</kbd>, the shortcut again, the ✕ button, or a click outside | close |

<p align="center">
  <img src="docs/light.png" width="420" alt="Light mode with a custom teal accent, converting 10 km to miles">
  <img src="docs/emoji.png" width="420" alt="Finding the smile emoji through GNOME Characters">
</p>
<p align="center">
  <img src="docs/suggestions.png" width="420" alt="Suggested apps before typing">
  <img src="docs/dark.png" width="420" alt="Dark mode, searching for “lock”: Lock Screen is the top hit">
</p>

## Make it yours

Open **Extension Manager → Eureka → Settings** (or `gnome-extensions prefs eureka@shahriyar31.github.io`).

<img src="docs/preferences.png" width="300" align="right" alt="Eureka settings, Appearance page">

- **Shortcut.** Pick Super+Space (like ⌘ Space on a Mac), Ctrl+Space, Alt+Space, Ctrl+Alt+Space or Super+Alt+Space,
  or record any combination, plus an optional second one. If GNOME already uses your choice, the settings tell you
  which action and free it in one click.
- **Theme.** Follow the system, or always light or dark.
- **Accent colour.** Your system accent or any colour. Every tone (panel, search field, selection, icon circles)
  is derived from it, Material You style.
- **Shape.** Corner radius, width, distance from the top, comfortable or compact rows, tinted or plain icons.
- **Text.** Any installed font, text size, section headings, second lines, keyboard hints.
- **Depth.** Panel opacity, frosted blur (GNOME's own blur, nothing extra to install), outline, screen dimming.
- **Motion.** Animations on or off and their speed. GNOME's *Reduce animation* setting is respected.
- **Behaviour.** An optional search icon in the top bar, which screen it opens on, which kinds of results to show
  and how many.
- **Web engines.** Add or remove engines and choose the fallback. Defaults: Google `g`, DuckDuckGo `d`,
  YouTube `yt`, Wikipedia `w`, GitHub `gh`.

<br clear="right">

## Privacy and security

- **No network access.** Eureka contains no networking code. Only the web row opens your browser, when you choose it.
- **Nothing is logged or stored.** What you type is never written to disk or to the system log.
- **Never runs what it finds.** Programs, scripts and launchers found in file search open in Files, never start.
- **No shell commands.** Eureka starts only GNOME's file-index search and GNOME's log-out dialog, with fixed arguments.
- **Your search providers, your choice.** Like the Activities search, Eureka asks the GNOME apps enabled in
  *Settings → Search* (Characters, Clocks…). They run on your computer. Turn any off there, or all of them in
  Eureka's settings.
- **Safe settings.** Web engines must be `https://`. Colours and font names are checked before use.
- **Its own window.** Eureka never changes GNOME's overview search, the approach that has crashed other
  Spotlight-style extensions on GNOME 50.

Found a security problem? Please report it privately, see [SECURITY.md](SECURITY.md).

## Troubleshooting

**The shortcut does nothing.** Log out and back in once after installing. If it still does nothing, open Eureka's
settings: if another GNOME action uses the same keys (Super+Space switches keyboard layouts by default), a warning
appears there with a **Free it** button. Or choose another shortcut.

**No files in the results.** Eureka uses GNOME's file index. Turn it on in *Settings → Search → Files* and give it a
few minutes to index your folders.

**Too many results from one app** (for example Software). Turn that app off in *Settings → Search*, or turn off
*GNOME search providers* in Eureka's settings.

**I want my old Super+Space layout switching back.** In *Settings → Keyboard → View and Customise Shortcuts → Typing*,
set *Switch to next input source* again.

## Uninstall

In *Extension Manager*, remove Eureka from the *Installed* list. Or:

```bash
gnome-extensions uninstall eureka@shahriyar31.github.io
```

## Compared with other GNOME launchers

| | Eureka | Search Light | Spotlight |
|---|:-:|:-:|:-:|
| GNOME 50 | ✓ | up to 49 | ✓ |
| Leaves the overview search untouched | ✓ | moves it | moves it |
| Apps, files, calculator, system actions, web | ✓ | ✓ | ✓ |
| GNOME search providers (emoji, Settings, Clocks…) | ✓ | ✓ | Settings only |
| Unit converter | ✓ offline | ✓ | – |
| Blur without extra packages | ✓ | needs ImageMagick | – |
| Colours derived from your accent (Material You) | ✓ | – | – |
| Currency converter | – (would need the internet) | ✓ | – |

*Compared on 26 October 2026 from each project's own page.*

## Contributing

Bug reports and ideas are welcome in [Issues](https://github.com/Shahriyar31/eureka/issues). Translations too: copy
`po/eureka.pot` to `po/<language>.po` and open a pull request.

For code changes:

```bash
make lint            # ESLint
dev/smoke-test.sh    # must pass: real key presses and clicks in an isolated GNOME session
make pack            # the zip for extensions.gnome.org
```

`dev/run-test.sh "firefox;lock;<prefs>" dark` starts a separate GNOME Shell with its own settings (your desktop is
never touched), types the queries and saves a screenshot of each step.

## Licence

GPL-2.0-or-later, like GNOME Shell. See [LICENSE](LICENSE).
