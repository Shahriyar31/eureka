# Changelog

## 1.1.1 (2026-10-27)

- Review fixes from GNOME's Shexli checker: clipboard use is declared (write-only, on Enter), the currency cache is
  read and written in the background, all signals are disconnected explicitly, no `run_dispose()`.
- No deprecated APIs (`orientation` instead of `vertical`), and patterns that confused code parsers are escaped.

## 1.1.0 (2026-10-27)

- Folders in results, the one you used most recently first; they open in Files.
- Currency converter (opt-in) with the European Central Bank's daily rates; searches are never sent.
- Faster typing: apps, maths and conversions update on every keystroke, and Enter always acts on the current text.
- Support link in the settings and a Donate entry for Extension Manager.
- File search moved into its own module with unit tests; `make test` runs unit tests, file search tests and the
  real-input checklist.

## 1.0.0 (2026-10-26)

- First release for GNOME Shell 50.
- Search applications, open windows, files (GNOME file index), maths, units, system actions and the web.
- Results from GNOME search providers (Characters/emoji, Settings, Clocks, Contacts, Software…), following Settings → Search.
- Suggested apps before typing; Alt+1…9 to open a row; Alt+Enter copies a file path; Ctrl+Enter shows it in Files.
- Shortcut presets, a recorder for any combination and detection of clashes with GNOME's (and your own custom) shortcuts.
- Close with Esc, the shortcut again, the ✕ button or a click outside; Esc works wherever the focus is.
- Long result lists scroll inside the screen.
- Optional frosted blur, outline, top-bar icon, second shortcut and animation speed.
- Material-style look with tonal colours from the system accent or a custom colour; light, dark or automatic.
- Settings for shape, size, density, font, text size, transparency, shortcut, monitor, sources, limits and web engines.
- Privacy and security: no network code, no logging, never runs found programs, https-only engines.
