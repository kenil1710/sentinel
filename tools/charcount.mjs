// Prints the exact character count of each text block in docs/SUBMISSION.md and fails if any is over its limit.
import { readFileSync, writeFileSync } from "node:fs";
const p = new URL("../docs/SUBMISSION.md", import.meta.url);
let md = readFileSync(p, "utf8");
const limits = { ONELINER: 180, REPLY: 1000, MILESTONE: 1000, PROJECT: 1000, REVIEW: 500 };
let bad = 0;
for (const [k, lim] of Object.entries(limits)) {
  const m = md.match(new RegExp(`<!--${k}-->\\n([\\s\\S]*?)\\n<!--/${k}-->(\\n\\n_[^\\n]*_)?`));
  const text = m[1];
  const n = [...text].length;
  if (n > lim) bad++;
  console.log(`${k.padEnd(10)} ${n} / ${lim} ${n > lim ? "OVER" : "ok"}`);
  md = md.replace(m[0], `<!--${k}-->\n${text}\n<!--/${k}-->\n\n_${n} characters (limit ${lim})._`);
}
writeFileSync(p, md);
process.exit(bad ? 1 : 0);
