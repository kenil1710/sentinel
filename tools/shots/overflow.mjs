// No horizontal scroll at 375 px: scrollWidth must not exceed the viewport on any page.
//   BASE=https://sentinel-tau-ashen.vercel.app node overflow.mjs
import { chromium } from "playwright";
const BASE = process.env.BASE ?? "http://localhost:3311";
const paths = process.argv.slice(2).length ? process.argv.slice(2) : ["/", "/agents", "/challenges", "/register", "/precedents", "/patrol", "/docs", "/consumer", "/balance", "/leaderboard", "/analytics", "/agent/0", "/agent/1", "/challenge/0", "/challenge/1"];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
let bad = 0;
for (const path of paths) {
  await p.goto(BASE + path, { waitUntil: "networkidle", timeout: 90_000 }).catch(() => {});
  await p.waitForTimeout(Number(process.env.SETTLE_MS ?? 2500));
  const m = await p.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const wide = [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > w + 1 && getComputedStyle(e).position !== "fixed")
      .filter((e) => !e.closest("[class*=overflow-x-auto],[class*=overflow-auto],pre,table")).slice(0, 3).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 50)}`);
    return { scroll: document.documentElement.scrollWidth, width: w, wide };
  });
  const ok = m.scroll <= m.width;
  if (!ok) bad++;
  console.log(`${path.padEnd(16)} ${ok ? "OK " : "OVERFLOW"} scrollWidth ${m.scroll} / ${m.width} ${m.wide.join(" ")}`);
}
await b.close();
process.exit(bad ? 1 : 0);
