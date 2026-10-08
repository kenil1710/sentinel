// Lighthouse accessibility (and best-practices) scores for the main pages.
//   BASE=https://sentinel-tau-ashen.vercel.app node a11y.mjs [path...]
import lighthouse from "lighthouse";
import { chromium } from "playwright";
const BASE = process.env.BASE ?? "http://localhost:3311";
const paths = process.argv.slice(2).length ? process.argv.slice(2) : ["/", "/agents", "/challenges", "/register", "/precedents", "/patrol", "/docs", "/consumer", "/balance", "/leaderboard", "/analytics", "/agent/0", "/challenge/0"];
const browser = await chromium.launch({ args: ["--remote-debugging-port=9333"] });
const out = [];
for (const p of paths) {
  const r = await lighthouse(BASE + p, { port: 9333, output: "json", logLevel: "error", onlyCategories: ["accessibility"], formFactor: "mobile",
    screenEmulation: { mobile: true, width: 375, height: 812, deviceScaleFactor: 2, disabled: false } });
  const a = r.lhr.categories.accessibility.score * 100;
  const fails = Object.values(r.lhr.audits).filter((x) => x.score === 0 && x.details?.items?.length).map((x) => `${x.id}(${x.details.items.length})`);
  out.push({ path: p, accessibility: a, failing: fails });
  console.log(`${p.padEnd(16)} ${a}  ${fails.join(" ")}`);
}
await browser.close();
if (process.env.JSON) console.log(JSON.stringify(out));
