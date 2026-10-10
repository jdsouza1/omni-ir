#!/usr/bin/env bash
# Records the demo video's Android scene (PLAN-VIDEO.md) on a running emulator: the order from the
# server (OMNI_SERVER, free mock model) streams in and moves on by itself, in recording mode (only the
# screen shows). Run from android/ after `./gradlew :demo:assembleDebug`.
# Output: video/order.mp4 and video/order.t0 (the host's clock when recording started; the compose step
# lines it up with the server's log, which runs on the same host).
set -euo pipefail
APP=dev.omniir.demo
mkdir -p video
adb install -r demo/build/outputs/apk/debug/demo-debug.apk >/dev/null
adb shell settings put global hide_error_dialogs 1 || true
adb shell am force-stop "$APP"

wait_text() {
  for _ in $(seq 1 60); do
    adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || true
    adb pull /sdcard/ui.xml video/ui.xml >/dev/null 2>&1 || true
    if grep -q "text=\"$1\"" video/ui.xml 2>/dev/null; then return 0; fi
    sleep 1
  done
  echo "$1 never appeared"
  return 1
}

adb shell screenrecord --time-limit 60 /sdcard/order.mp4 &
recorder=$!
date +%s.%N > video/order.t0
sleep 0.5
# adb shell joins its arguments into one command line, so a value with spaces is quoted again inside.
adb shell am start -n "$APP/.MainActivity" --es server "$OMNI_SERVER" --es prompt "'Where is my order?'" --es appearance light --es video true >/dev/null
wait_text "Delivered"
sleep 3
adb shell pkill -INT screenrecord || true
wait "$recorder" || true
sleep 2
adb pull /sdcard/order.mp4 video/order.mp4 >/dev/null
rm -f video/ui.xml
ls -la video
