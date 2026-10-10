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

# The server on the host, as the emulator reaches it (10.0.2.2 is the host).
curl -fsS http://localhost:8787/api/health && echo
adb shell 'curl -fsS -m 5 http://10.0.2.2:8787/api/health' || echo "the emulator can't reach the server yet"

# One take: the order from the server, until it shows Delivered. On a miss, keep the app's log and a
# screenshot (recording mode hides the app's own error line), then try once more.
take() {
  adb shell am force-stop "$APP"
  adb logcat -c || true
  adb shell screenrecord --time-limit 60 /sdcard/order.mp4 &
  recorder=$!
  date +%s.%N > video/order.t0
  sleep 0.5
  # adb shell joins its arguments into one command line, so a value with spaces is quoted again inside.
  adb shell am start -n "$APP/.MainActivity" --es server "$OMNI_SERVER" --es prompt "'Where is my order?'" --es appearance light --es video true >/dev/null
  if wait_text "Delivered"; then ok=0; else ok=1; fi
  sleep 3
  adb shell pkill -INT screenrecord || true
  wait "$recorder" || true
  sleep 2
  if [ "$ok" != 0 ]; then
    adb exec-out screencap -p > "video/miss-$1.png" || true
    adb logcat -d > "video/miss-$1-logcat.txt" || true
    grep -iE "omniir|OmniClient|Exception|cleartext|ECONNREFUSED|network" "video/miss-$1-logcat.txt" | tail -20 || true
  fi
  return $ok
}
take 1 || { echo "first take missed; trying again"; sleep 5; take 2; }
adb pull /sdcard/order.mp4 video/order.mp4 >/dev/null
rm -f video/ui.xml
ls -la video
