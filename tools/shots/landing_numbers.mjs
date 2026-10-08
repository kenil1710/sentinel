// Reads the live figures off the landing page (the [data-stat] cells) once they have loaded.
//   node landing_numbers.mjs https://sentinel-tau-ashen.vercel.app   -> one JSON line
import { chromium } from "playwright";
const site = process.argv[2] ?? "http://localhost:3311";
const b = await chromium.launch();
const p = await b.newPage();
await p.goto(site + "/", { waitUntil: "domcontentloaded", timeout: 120_000 });
await p.waitForFunction(() => [...document.querySelectorAll("[data-stat]")].every((e) => e.textContent.trim() !== "—"), null, { timeout: 180_000 }).catch(() => {});
const vals = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-stat]")].map((e) => [e.getAttribute("data-stat"), e.textContent.trim()])));
await b.close();
console.log(JSON.stringify(vals));
