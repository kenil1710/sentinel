import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
const address = "0xcb068e75c4a4dC9603bDf12612583252B8A06b6C";
const read = createClient({ chain: testnetBradbury });
const view = async (fn,a=[]) => { const r = await read.readContract({address,functionName:fn,args:a}); return typeof r==="string"?JSON.parse(r):r; };
const stamp = () => new Date().toTimeString().slice(0,8);
for (let i = 0; i < 10; i++) {
  const s = await view("get_stats");
  console.log(`${stamp()}  patrols_run=${s.patrols_run}  challenges_filed=${s.challenges_filed}  settled=${s.challenges_settled}`);
  if (s.patrols_run > 0 || s.challenges_filed > 0) { console.log("CRON FIRED"); break; }
  await new Promise(r => setTimeout(r, 60_000));
}
