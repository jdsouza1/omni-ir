#!/usr/bin/env bash
# Takes the review screenshots and recording on a running emulator (PLAN-ANDROID.md, E). Run from
# android/ after `./gradlew :demo:assembleDebug`. Output: review/screenshots/*.png, review/streaming.mp4.
set -euo pipefail
APP=dev.omniir.demo
mkdir -p review/screenshots
adb install -r demo/build/outputs/apk/debug/demo-debug.apk >/dev/null
adb shell settings put system font_scale 1.0

shot() {
  local name=$1; shift
  adb shell am force-stop "$APP"
  adb shell am start -W -n "$APP/.MainActivity" "$@" >/dev/null
  sleep 4
  adb exec-out screencap -p > "review/screenshots/$name.png"
  echo "screenshot $name"
}

screens=(landing/booking landing/checkout landing/assistant payment-confirmation sign-in order-status profile-settings support-contact)
for appearance in light dark; do
  for s in "${screens[@]}"; do shot "${s//\//-}-$appearance" --es fixture "$s" --es appearance "$appearance" --es instant true; done
done

adb shell settings put system font_scale 1.6
for s in landing/booking payment-confirmation; do shot "${s//\//-}-light-large-text" --es fixture "$s" --es appearance light --es instant true; done
adb shell settings put system font_scale 1.0

for s in variants/dangling-child variants/unknown-tool; do shot "${s//\//-}-light" --es fixture "$s" --es appearance light --es instant true; done

# Recording: the booking screen streams in, then Reserve is tapped (found through the accessibility tree).
adb shell am force-stop "$APP"
adb shell screenrecord --time-limit 30 /sdcard/streaming.mp4 &
recorder=$!
sleep 1
adb shell am start -n "$APP/.MainActivity" --es fixture landing/booking --es appearance light >/dev/null
sleep 6
adb shell uiautomator dump /sdcard/ui.xml >/dev/null
adb pull /sdcard/ui.xml review/ui.xml >/dev/null
bounds=$(grep -o 'text="Reserve · \$642"[^>]*bounds="\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]"' review/ui.xml | grep -o 'bounds="[^"]*"' | head -1 || true)
if [ -n "$bounds" ]; then
  read -r x1 y1 x2 y2 <<<"$(echo "$bounds" | grep -oE '[0-9]+' | tr '\n' ' ')"
  adb shell input tap $(( (x1 + x2) / 2 )) $(( (y1 + y2) / 2 ))
  echo "tapped Reserve"
else
  echo "Reserve not found in the accessibility tree"
fi
sleep 4
adb shell pkill -INT screenrecord || true
wait "$recorder" || true
sleep 2
adb pull /sdcard/streaming.mp4 review/streaming.mp4 >/dev/null
ls -la review review/screenshots
