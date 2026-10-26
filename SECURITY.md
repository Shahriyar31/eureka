# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Use GitHub's
[private vulnerability reporting](https://github.com/Shahriyar31/eureka/security/advisories/new) instead.
You will get an answer within 7 days.

## What Eureka promises

| Area | Promise | Where in the code |
|---|---|---|
| Network | None by default. The opt-in currency converter downloads `https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml` at most every 12 hours (10 s timeout, 64 KB limit), independent of what you type; the query is never sent. The file is parsed with strict patterns and rejected unless it holds a date and at least 20 positive rates with ISO codes. | `providers/currency.js` |
| Search providers | The query goes to the local GNOME apps enabled in Settings → Search, over their public D-Bus interface, exactly as the Activities overview does. Results are shown as text; activating one asks that app to open it. Files (Nautilus) and Calculator are never asked. | `providers/gnome.js` |
| Logging | Queries are never logged or written to disk. | `extension.js`, `providers/sources.js` |
| Execution | No shell. Only two fixed commands run: `localsearch`/`tracker3 search --files -- <words>` and `gnome-session-quit --logout/--reboot/--power-off`. The `--` stops search words from being read as options. | `providers/sources.js` |
| Files | Programs, scripts, `.desktop` launchers, AppImages and executable files are revealed in Files, never opened. | `isRunnable()` in `providers/sources.js` |
| Web | Engines must be `https://` URLs with exactly one `%s`. Search words are URL-encoded. | `isSafeEngine()` in `providers/sources.js`, `prefs.js` |
| Maths | A small parser, never `eval`. | `providers/calculator.js` |
| Styling | Colours must be `#rrggbb`. Font names may only contain letters, digits, spaces, `-`, `_` and `.`. | `safeHex()`, `safeFont()` in `extension.js` |
| Lock screen | Eureka is turned off while the screen is locked, so it can never appear on the lock screen. | `metadata.json` (no `session-modes`) |
