import lighthouse from "lighthouse";
import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--remote-debugging-port=9334"] });
for (const p of process.argv.slice(2)) {
  const r = await lighthouse("https://sentinel-tau-ashen.vercel.app" + p, { port: 9334, output: "json", logLevel: "error", onlyCategories: ["accessibility"], formFactor: "mobile", screenEmulation: { mobile: true, width: 375, height: 812, deviceScaleFactor: 2, disabled: false } });
  for (const id of ["color-contrast", "link-in-text-block"]) for (const it of (r.lhr.audits[id].details?.items ?? []).slice(0, 6)) console.log(p, id, it.node?.selector?.slice(-90), "|", (it.node?.snippet ?? "").slice(0, 110), "|", (it.node?.explanation ?? "").slice(0, 120).split("\n").join(" "));
}
await b.close();
