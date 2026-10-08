"use client";

import { useEffect, useState } from "react";
import { absoluteTime } from "@/lib/format";

/** Seconds since the epoch, ticking once a second (client only). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function span(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${sec.toString().padStart(2, "0")}s`;
  return `${sec}s`;
}

/** "closes in 41m 03s" / "closed 2h ago", with the absolute time on hover. */
export function Countdown({ at, open = "closes in", closed = "closed" }: { at: number; open?: string; closed?: string }) {
  const now = useNow();
  if (!at) return <span>—</span>;
  const left = at - now;
  return (
    <time dateTime={new Date(at * 1000).toISOString()} title={absoluteTime(at)} className="mono tabular-nums">
      {left > 0 ? `${open} ${span(left)}` : `${closed} ${span(-left)} ago`}
    </time>
  );
}
