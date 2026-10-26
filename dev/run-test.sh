#!/bin/sh
# Runs Eureka in an isolated GNOME Shell (own D-Bus and own settings: your real desktop is never touched),
# types the given queries and saves screenshots.   Usage: dev/run-test.sh "firefox;12*7;lock" [dark|light]
set -eu
ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK=${EUREKA_WORK:-$(mktemp -d)}
mkdir -p "$WORK/config" "$WORK/shots"
glib-compile-schemas "$ROOT/eureka@shahriyar31.github.io/schemas"   # running from source needs the compiled schema
EXT="$HOME/.local/share/gnome-shell/extensions"
ln -sfn "$ROOT/eureka@shahriyar31.github.io" "$EXT/eureka@shahriyar31.github.io"
ln -sfn "$ROOT/dev/eureka-devtest@local" "$EXT/eureka-devtest@local"
SCHEME=${2:-dark}; [ "$SCHEME" = dark ] && CS=prefer-dark || CS=default
# XDG_CONFIG_HOME must be set *before* dbus-run-session, so the test's settings service writes to $WORK only
export EUREKA_QUERIES="$1" EUREKA_SHOTS="$WORK/shots"
env XDG_CONFIG_HOME="$WORK/config" dbus-run-session -- sh -c "
  dconf write /org/gnome/shell/enabled-extensions \"['eureka@shahriyar31.github.io', 'eureka-devtest@local']\"
  dconf write /org/gnome/desktop/interface/color-scheme \"'$CS'\"
  timeout 120 gnome-shell --devkit --wayland --no-x11 --virtual-monitor 1536x960
" > "$WORK/shell.log" 2>&1 || true
rm -f "$EXT/eureka-devtest@local"
grep -E 'DEVTEST|JS ERROR|Eureka:' "$WORK/shell.log" | sed 's/.*DEVTEST/DEVTEST/'
echo "screenshots: $WORK/shots"
