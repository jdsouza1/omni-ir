// Edits the demo video (PLAN-VIDEO.md) from the recordings the `video` workflow makes, with ffmpeg:
// lines the three platforms up by the server's own log, adds the Golden Circle cards (why, how, what;
// the owner chose the universal-language angle, 2026-10-10),
// the captions and the corner note, and writes the full video, a short cut, a GIF and a poster.
//
//   node scripts/video/compose.mjs rec out
//
// rec/ios:     order.mov, order.t0, delete.mov, delete.t0, server.log
// rec/android: order.mp4, order.t0, server.log, web/frames.ffconcat (+ frames/), web/meta.json
// A `.t0` file holds the wall-clock second a recording started; the server log says when each screen
// was asked for, so every clip starts the same half-second before its request. The iPhone simulator's
// recorder drops idle seconds at the start, so its clips also have a `.t1` (when recording stopped)
// and are lined up backwards from their end, which is exact.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const rec = resolve(process.argv[2] ?? "rec");
const out = resolve(process.argv[3] ?? "video-out");
const work = join(out, "work");
mkdirSync(work, { recursive: true });

const FONT = process.env.VIDEO_FONT ?? "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const FONT_REGULAR = process.env.VIDEO_FONT_REGULAR ?? "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
const MONO = process.env.VIDEO_FONT_MONO ?? "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf";
const W = 1920;
const H = 1080;
const BG = "0xf5f6f8";
const INK = "0x1b2230";
const MUTED = "0x5b6577";
const ACCENT = "0x2456d6";
const NOTE = "Demo with pre-written screens; no AI model was called.";
const ENCODE = ["-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30", "-an"];

const ffmpeg = (args) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
let textN = 0;
/** drawtext from a file, so nothing in the words needs escaping. */
function text(words, { size = 56, color = INK, font = FONT, x = "(w-text_w)/2", y = "(h-text_h)/2", enable } = {}) {
  const file = join(work, `text-${textN++}.txt`);
  writeFileSync(file, words);
  const esc = (p) => p.replace(/\\/g, "/").replace(/:/g, "\\:");
  return `drawtext=fontfile=${esc(font)}:textfile=${esc(file)}:fontsize=${size}:fontcolor=${color}:x=${x}:y=${y}${enable ? `:enable='${enable}'` : ""}`;
}
const note = () => text(NOTE, { size: 22, color: MUTED, font: FONT_REGULAR, x: "w-text_w-36", y: "h-text_h-20" });

// ---------------------------------------------------------------------------------------------
// When each screen was asked for, from the server's own log (one JSON object per line).

function log(file) {
  return readFileSync(file, "utf8").split("\n").flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
}
/** The first request for a screen after `t0`: when it started (G) and when the stream ended (E), in seconds. */
function request(entries, t0) {
  const e = entries.find((x) => x.event === "generate" && x.outcome === "done" && Date.parse(x.time) / 1000 - x.ms / 1000 >= t0 - 1);
  if (!e) throw new Error(`no request after ${t0}`);
  const E = Date.parse(e.time) / 1000;
  return { G: E - e.ms / 1000, E };
}
const t0 = (file) => Number(readFileSync(file, "utf8").trim());
const duration = (file) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString());
/** Where a wall-clock moment falls in a clip: from its start, or backwards from its end when it has one. */
const at = (clip, wall) => (clip.t1 ? clip.duration - (clip.t1 - wall) : wall - clip.t0);
/** A clip lined up from its end, if the recording says when it stopped. */
function fromEnd(clip, name) {
  const file = join(rec, "ios", `${name}.t1`);
  if (existsSync(file)) Object.assign(clip, { t1: t0(file), duration: duration(clip.file) });
  return clip;
}

const iosLog = log(join(rec, "ios", "server.log"));
const androidLog = log(join(rec, "android", "server.log"));
const ios = fromEnd({ file: join(rec, "ios", "order.mov"), t0: t0(join(rec, "ios", "order.t0")) }, "order");
const android = { file: join(rec, "android", "order.mp4"), t0: t0(join(rec, "android", "order.t0")) };
const webMeta = JSON.parse(readFileSync(join(rec, "android", "web", "meta.json"), "utf8"));
const web = { file: join(rec, "android", "web", "frames.ffconcat"), t0: webMeta.t0, concat: true };
Object.assign(ios, request(iosLog, ios.t0));
Object.assign(android, request(androidLog, android.t0));
Object.assign(web, request(androidLog, web.t0)); // the web page asks the Android job's server, before the emulator does
const ret = iosLog.find((x) => x.event === "mutate" && x.tool === "orders.requestReturn" && x.outcome === "ok");
const del = fromEnd({ file: join(rec, "ios", "delete.mov"), t0: t0(join(rec, "ios", "delete.t0")) }, "delete");
Object.assign(del, request(iosLog, del.t0));
console.log({ ios, android, web, del, returnAt: ret?.time });

// ---------------------------------------------------------------------------------------------
// The segments, each 1920x1080 at 30 fps, then joined.

const segments = [];
function card(name, seconds, filters) {
  const file = join(work, `${name}.mp4`);
  ffmpeg(["-f", "lavfi", "-i", `color=c=${BG}:s=${W}x${H}:d=${seconds}:r=30`, "-vf", [...filters, `fade=t=in:st=0:d=0.4`].join(","), ...ENCODE, "-t", String(seconds), file]);
  return file;
}
const input = (clip, start, seconds) =>
  clip.concat ? ["-f", "concat", "-safe", "0", "-ss", String(start), "-t", String(seconds), "-i", clip.file] : ["-ss", String(start), "-t", String(seconds), "-i", clip.file];

// Why: three cards.
segments.push(card("why-1", 3, [text("AI writes most of the code now.", { size: 68 })]));
segments.push(card("why-2", 3.5, [
  text("But it still writes every screen three times.", { size: 64, y: "(h/2)-70" }),
  text("React  ·  Swift  ·  Kotlin", { size: 40, color: MUTED, font: FONT_REGULAR, y: "(h/2)+30" }),
]));
segments.push(card("why-3", 3, [text("What if it wrote the screen once?", { size: 68, color: ACCENT })]));

// How, 1: the lines the AI writes, appearing one by one.
const lines = readFileSync("fixtures/order-status.omni", "utf8").split("\n").filter((l) => l.trim() && !l.startsWith("#")).slice(0, 7);
segments.push(card("how-lines", 4.5, [
  text("One description, in a few plain lines.", { size: 52, y: "120" }),
  ...lines.map((l, i) => text(l.length > 70 ? `${l.slice(0, 67)}...` : l, { size: 30, font: MONO, x: "300", y: String(300 + i * 62), enable: `gte(t,${0.3 + i * 0.45})` })),
]));

// How, 2 and 3: the three platforms side by side, from just before the request to "Delivered".
const stream = Math.max(...[ios, android, web].map((c) => c.E - c.G));
const sideBy = stream + 0.5 + 10.5;
const captionSwitch = 0.5 + stream + 3.5; // the first update comes 4 s after the stream ends
const PANEL_H = 780;
{
  const file = join(work, "how-platforms.mp4");
  const clips = [ios, android, web];
  const args = clips.flatMap((c) => input(c, Math.max(0, at(c, c.G - 0.5)), sideBy));
  const scaled = clips.map((_, i) => `[${i}:v]fps=30,scale=-2:${PANEL_H},setpts=PTS-STARTPTS[p${i}]`).join(";");
  const widths = [367, 351, 468]; // iPhone 1206x2622, Android 1080x2400, web 600x1000, at 780 high
  const gap = 90;
  const total = widths.reduce((a, b) => a + b) + gap * 2;
  let x = (W - total) / 2;
  const xs = widths.map((w) => { const at = x; x += w + gap; return at; });
  const labels = ["iPhone", "Android", "Web"];
  const graph =
    `color=c=${BG}:s=${W}x${H}:d=${sideBy}:r=30[bg];${scaled};` +
    `[bg][p0]overlay=${xs[0]}:160[a];[a][p1]overlay=${xs[1]}:160[b];[b][p2]overlay=${xs[2]}:160,` +
    [
      text("Every platform draws it natively.", { size: 50, y: "70", enable: `lt(t,${captionSwitch})` }),
      text("Your app keeps it current, everywhere at once.", { size: 50, y: "70", enable: `gte(t,${captionSwitch})` }),
      ...labels.map((l, i) => text(l, { size: 26, color: MUTED, font: FONT_REGULAR, x: `${xs[i]}+(${widths[i]}-text_w)/2`, y: String(160 + PANEL_H + 14) })),
      note(),
    ].join(",") + `,fade=t=in:st=0:d=0.3[v]`;
  ffmpeg([...args, "-filter_complex", graph, "-map", "[v]", ...ENCODE, "-t", String(sideBy), file]);
  segments.push(file);
}

// One phone, centred: the return and the delete button.
function phone(name, clip, start, seconds, caption) {
  const file = join(work, `${name}.mp4`);
  const graph =
    `color=c=${BG}:s=${W}x${H}:d=${seconds}:r=30[bg];[0:v]fps=30,scale=-2:840,setpts=PTS-STARTPTS[p];[bg][p]overlay=(W-w)/2:160,` +
    [text(caption, { size: 50, y: "70" }), note()].join(",") + `,fade=t=in:st=0:d=0.3[v]`;
  ffmpeg([...input(clip, Math.max(0, at(clip, start)), seconds), "-filter_complex", graph, "-map", "[v]", ...ENCODE, "-t", String(seconds), file]);
  return file;
}
const returnAt = ret ? Date.parse(ret.time) / 1000 : ios.E + 12;
segments.push(phone("how-return", ios, returnAt - 2.5, 7.5, "Every action is still checked by your server."));
segments.push(phone("how-delete", del, del.G - 0.3, 8, "The AI can ask. Your app decides."));

// What: the end card.
segments.push(card("what", 7, [
  text("Omni-IR", { size: 110, y: "(h/2)-190" }),
  text("A universal UI language for AI.", { size: 60, color: ACCENT, y: "(h/2)-40" }),
  text("Write the screen once  ·  native on iPhone, Android and the web  ·  open source", { size: 30, color: MUTED, font: FONT_REGULAR, y: "(h/2)+70" }),
  text("jdsouza1.github.io/omni-ir", { size: 34, color: INK, font: FONT_REGULAR, y: "(h/2)+150" }),
]));

// ---------------------------------------------------------------------------------------------
// Join, then the short cut, the GIF and the poster.

function join_(name, files) {
  const list = join(work, `${name}.txt`);
  writeFileSync(list, files.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n") + "\n");
  const file = join(out, `${name}.mp4`);
  ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", file]);
  return file;
}
const full = join_("omni-ir-demo", segments);
const platforms = join(work, "how-platforms.mp4");
join_("omni-ir-demo-short", [platforms, segments.at(-1)]); // the platforms side by side, then the end card
ffmpeg(["-i", platforms, "-vf", "fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer", "-loop", "0", join(out, "omni-ir-demo.gif")]);
ffmpeg(["-ss", String(sideBy - 0.5), "-i", platforms, "-frames:v", "1", join(out, "omni-ir-demo-poster.png")]);
// Frames from every scene, for checking the video before anyone sees it (working rules).
const checks = join(out, "check");
mkdirSync(checks, { recursive: true });
let total = 0;
for (const [i, f] of segments.entries()) {
  const seconds = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());
  for (const frac of [0.25, 0.9]) ffmpeg(["-ss", String(seconds * frac), "-i", f, "-frames:v", "1", "-vf", "scale=960:-1", join(checks, `${String(i + 1).padStart(2, "0")}-${frac === 0.25 ? "a" : "b"}.jpg`)]);
  total += seconds;
}
console.log(`compose: ${full} (${total.toFixed(1)} s)`);
if (!existsSync(full)) process.exit(1);
