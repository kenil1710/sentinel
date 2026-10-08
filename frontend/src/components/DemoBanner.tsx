"use client";

import { DEMO_ADDRESS, setDeployment } from "@/lib/genlayer";
import { useDeployment } from "./useDeployment";

/** Says plainly when the app is pointed at the demo deployment, and how to go back. */
export function DemoBanner() {
  if (useDeployment() !== "demo") return null;
  return (
    <div className="border-b border-neutral/30 bg-neutral/10 px-5 py-2 text-center text-[13px] text-neutral-ink">
      You are on the <b>demo</b> deployment (<span className="mono">{DEMO_ADDRESS.slice(0, 8)}…</span>): same code, 90-second windows, for trying every path.{" "}
      <button className="font-medium underline" onClick={() => { setDeployment("canonical"); window.location.reload(); }}>Back to the canonical register</button>
    </div>
  );
}
