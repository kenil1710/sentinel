/**
 * Builds a narrated, captioned demo video from a script, recorded live.
 *
 *   node video.mjs ../../docs/demo/script.json  [--vertical]
 *
 * 1. Narration: macOS `say` per segment (voice from the script), measured with ffprobe.
 * 2. Recording: Playwright drives the LIVE site and the Studio Dev explorer, holding each
 *    segment on screen exactly as long as its narration, and records the browser.
 * 3. Captions: each segment's text split into short lines, timed by word share, rendered to
 *    transparent PNGs and burned in with ffmpeg overlay (this ffmpeg has no libass).
 * 4. Mux: narration placed at the recorded segment starts; H.264 + AAC; an .srt beside it.
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

const scriptPath = resolve(process.argv[2]);
const S = JSON.parse(readFileSync(scriptPath, "utf8"));
const vertical = process.argv.includes("--vertical") || S.vertical;
const W = vertical ? 1080 : 1920, H = vertical ? 1920 : 1080;
const VIEW = { width: W, height: H };
const ZOOM = vertical ? 2.5 : 1.25;
const OUTDIR = resolve(dirname(scriptPath), S.out_dir ?? ".");
const WORK = resolve(OUTDIR, `.work-${S.name}`);
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
const sh = (cmd, args) => execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 26 }).toString();
const dur = (f) => Number(sh("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).trim());

// 1. narration
const segs = S.segments.map((s, i) => ({ ...s, i }));
for (const s of segs) {
  const aiff = `${WORK}/n${s.i}.aiff`;
  sh("say", ["-v", S.voice ?? "Samantha", "-r", String(S.rate ?? 178), "-o", aiff, s.say]);
  s.audio = aiff;
  s.len = dur(aiff);
  s.hold = s.len + (s.pad ?? 0.6);
}
const total = segs.reduce((a, s) => a + s.hold, 0);
console.log(`narration ${total.toFixed(1)} s over ${segs.length} segments`);

// 2. record
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1,
  recordVideo: { dir: WORK, size: { width: W, height: H } } });
await ctx.addInitScript((z) => {
  const apply = () => { if (document.documentElement) document.documentElement.style.zoom = String(z); };
  apply();
  document.addEventListener("DOMContentLoaded", apply);
}, ZOOM);
if (S.storage) await ctx.addInitScript((kv) => { for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v); }, S.storage);
const page = await ctx.newPage();
const t0 = Date.now();
const smooth = async (y) => {
  const from = await page.evaluate(() => scrollY);
  for (let i = 1; i <= 30; i++) { await page.evaluate((v) => scrollTo(0, v), from + ((y - from) * i) / 30); await page.waitForTimeout(25); }
};
async function act(a) {
  if (!a) return;
  if (a.goto) {
    await page.goto(a.goto, { waitUntil: "domcontentloaded", timeout: 120_000 }).catch(() => {});
    if (a.wait) await page.waitForSelector(a.wait, { timeout: 120_000 }).catch(() => console.log("  ! wait timed out:", a.wait));
    if (a.waitFn) await page.waitForFunction(a.waitFn, null, { timeout: 120_000 }).catch(() => console.log("  ! waitFn timed out"));
  }
  if (a.scrollTo) {
    const y = await page.evaluate(([sel, off]) => { const e = document.querySelector(sel); return e ? e.getBoundingClientRect().top + scrollY - off : null; }, [a.scrollTo, a.offset ?? 90]);
    if (y !== null) await smooth(y); else console.log("  ! no element for", a.scrollTo);
  }
  if (a.scrollBy) await smooth((await page.evaluate(() => scrollY)) + a.scrollBy);
  if (a.click) await page.click(a.click, { timeout: 30_000 }).catch(() => console.log("  ! click failed", a.click));
  if (a.type) { await page.fill(a.type[0], ""); await page.type(a.type[0], a.type[1], { delay: 18 }); }
  if (a.highlight) await page.evaluate((sel) => { const e = document.querySelector(sel); if (e) { e.style.outline = "3px solid #0891B2"; e.style.outlineOffset = "4px"; e.style.borderRadius = "10px"; } }, a.highlight);
}
for (const s of segs) {
  s.start = (Date.now() - t0) / 1000;
  await act(s.action);
  const spent = (Date.now() - t0) / 1000 - s.start;
  const left = s.hold - spent;
  if (s.then && left > 2) {
    await page.waitForTimeout(Math.max(0, (left * 0.45) * 1000));
    await act(s.then);
  }
  const rest = s.hold - ((Date.now() - t0) / 1000 - s.start);
  if (rest > 0) await page.waitForTimeout(rest * 1000);
  s.end = (Date.now() - t0) / 1000;
  console.log(`  ${String(s.i).padStart(2)} ${s.start.toFixed(1)}–${s.end.toFixed(1)}s ${s.id ?? ""}`);
}
await page.waitForTimeout(800);
await ctx.close();
const webm = readdirSync(WORK).find((f) => f.endsWith(".webm"));

// 3. captions
const chunks = [];
for (const s of segs) {
  const words = (s.caption ?? s.say).split(/\s+/);
  const lines = [];
  let cur = [];
  const maxChars = vertical ? 30 : 64;
  for (const w of words) {
    if ((cur.join(" ") + " " + w).trim().length > maxChars && cur.length) { lines.push(cur.join(" ")); cur = []; }
    cur.push(w);
  }
  if (cur.length) lines.push(cur.join(" "));
  const per = vertical ? 2 : 2;
  const groups = [];
  for (let i = 0; i < lines.length; i += per) groups.push(lines.slice(i, i + per));
  const totalWords = words.length;
  let at = s.start + 0.15;
  for (const g of groups) {
    const share = g.join(" ").split(/\s+/).length / totalWords;
    const d = Math.max(0.9, s.len * share);
    chunks.push({ start: at, end: Math.min(at + d, s.end), lines: g });
    at += d;
  }
}
const capPage = await (await browser.newContext({ viewport: { width: W, height: vertical ? 420 : 220 } })).newPage();
for (const [k, c] of chunks.entries()) {
  await capPage.setContent(`<html><body style="margin:0;background:transparent;display:flex;align-items:flex-end;justify-content:center;height:100vh">
    <div style="margin-bottom:${vertical ? 40 : 26}px;max-width:${vertical ? 980 : 1500}px;padding:${vertical ? "18px 30px" : "12px 26px"};border-radius:14px;background:rgba(28,25,23,0.86);color:#fff;
      font:600 ${vertical ? 46 : 38}px/1.28 -apple-system,'SF Pro Text',Helvetica,Arial,sans-serif;text-align:center;letter-spacing:-0.2px">
      ${c.lines.map((l) => l.replace(/&/g, "&amp;").replace(/</g, "&lt;")).join("<br>")}</div></body></html>`);
  c.png = `${WORK}/c${k}.png`;
  await capPage.screenshot({ path: c.png, omitBackground: true });
}
await browser.close();

// 4. assemble
const final = resolve(OUTDIR, `${S.name}.mp4`);
const inputs = ["-i", `${WORK}/${webm}`];
for (const s of segs) inputs.push("-i", s.audio);
for (const c of chunks) inputs.push("-i", c.png);
let fc = `[0:v]fps=30,scale=${W}:${H}:flags=lanczos,format=yuv420p[v0];`;
let last = "v0";
chunks.forEach((c, k) => {
  const idx = 1 + segs.length + k;
  fc += `[${last}][${idx}:v]overlay=x=(W-w)/2:y=H-h:enable='between(t,${c.start.toFixed(2)},${c.end.toFixed(2)})'[v${k + 1}];`;
  last = `v${k + 1}`;
});
segs.forEach((s, k) => { fc += `[${k + 1}:a]adelay=${Math.round(s.start * 1000)}|${Math.round(s.start * 1000)},aresample=48000[a${k}];`; });
fc += segs.map((_, k) => `[a${k}]`).join("") + `amix=inputs=${segs.length}:normalize=0,volume=1.6[aout]`;
const end = segs[segs.length - 1].end + 0.5;
writeFileSync(`${WORK}/filter.txt`, fc);
sh("ffmpeg", ["-y", ...inputs, "-/filter_complex", `${WORK}/filter.txt`, "-map", `[${last}]`, "-map", "[aout]",
  "-t", end.toFixed(2), "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k",
  "-movflags", "+faststart", final]);
const ts = (t) => { const ms = Math.round(t * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60, r = ms % 1000; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(r).padStart(3, "0")}`; };
writeFileSync(resolve(OUTDIR, `${S.name}.srt`), chunks.map((c, k) => `${k + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.lines.join("\n")}\n`).join("\n"));
writeFileSync(resolve(OUTDIR, `${S.name}.timeline.json`), JSON.stringify(segs.map((s) => ({ id: s.id, start: +s.start.toFixed(2), end: +s.end.toFixed(2), say: s.say })), null, 1));
console.log(`wrote ${final} (${dur(final).toFixed(1)} s, ${W}x${H}) and ${S.name}.srt`);
if (!process.env.KEEP) rmSync(WORK, { recursive: true, force: true });
