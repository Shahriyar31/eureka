#!/bin/sh
# Release checklist, run before every commit: real key presses and clicks in an isolated GNOME session.
# Fails (exit 1) if any way of closing breaks, any search stops answering, or GNOME logs a warning from Eureka.
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d)
STEPS="<gset org.gnome.desktop.wm.keybindings switch-input-source ['XF86Keyboard']>;<set open-on='primary'>"
STEPS="$STEPS;<open>;<key Escape>;<open>;<click-outside>;<open>;<click-close>"
STEPS="$STEPS;<key super+space>;<key super+space>"
STEPS="$STEPS;<set toggle=['<Control><Alt>e']>;<key ctrl+alt+e>;<key ctrl+alt+e>;<set toggle=['<Super>space']>"
STEPS="$STEPS;firefox;<key Down>;<key Escape>;12*7;10 km to mi;lock;yt cats"
OUT=$(EUREKA_WORK="$WORK" "$ROOT/dev/run-test.sh" "$STEPS" dark)
echo "$OUT" | grep DEVTEST
expect() {
    if echo "$OUT" | grep -qF -- "$1"; then echo "  ok    $2"; else echo "  FAIL  $2"; FAILED=1; fi
}
FAILED=0
echo "Checks:"
expect "<key Escape> -> panel open=false" "Esc closes"
expect "<click-outside> -> panel open=false" "click outside closes"
expect "<click-close> -> panel open=false" "close button closes"
expect "<key super+space> -> panel open=true" "Super+Space opens"
expect "<key super+space> -> panel open=false" "Super+Space closes"
expect "<key ctrl+alt+e> -> panel open=true" "a custom shortcut opens"
expect "<key ctrl+alt+e> -> panel open=false" "a custom shortcut closes"
expect '"firefox" -> apps:Firefox' "apps"
expect '"12*7" -> calculator:= 84' "calculator"
expect '"10 km to mi" -> converter:10 km = 6.2137119 mi' "unit converter"
expect '"lock" -> system:Lock Screen' "system action is the top hit"
expect '"yt cats" -> web:' "web prefix"
WARN=$(grep -cE 'St-CRITICAL|JS ERROR|Gjs-CRITICAL' "$WORK/shell.log")
if [ "$WARN" -eq 0 ]; then echo "  ok    no GNOME warnings"; else echo "  FAIL  $WARN GNOME warnings (see $WORK/shell.log)"; FAILED=1; fi
[ "$FAILED" -eq 0 ] && echo "ALL PASSED" || echo "FAILED"
exit "$FAILED"
