**What's new**
- Review fixes from GNOME's Shexli checker: clipboard use is declared (write-only, on Enter), the currency cache is
  read and written in the background, all signals are disconnected explicitly, no `run_dispose()`.
- No deprecated APIs (`orientation` instead of `vertical`), and patterns that confused code parsers are escaped.

Also includes everything from 1.1.0: folders, the opt-in currency converter and faster typing.

### Install or update

Download `eureka@shahriyar31.github.io.shell-extension.zip` below, then:

```bash
gnome-extensions install --force eureka@shahriyar31.github.io.shell-extension.zip
```

Log out and back in, then `gnome-extensions enable eureka@shahriyar31.github.io`.

If Eureka saves you time, you can [buy me a coffee](https://buymeacoffee.com/shahriyarfarhan).
