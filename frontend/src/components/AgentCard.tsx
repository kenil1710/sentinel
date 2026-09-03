import Link from "next/link";
import { ChainTag, ScoreRing, StatusTag } from "./ui";
import { formatGen, relativeTime, shortAddress } from "@/lib/format";
import type { AgentSummary } from "@/types";

export function AgentCard({ agent }: { agent: AgentSummary }) {
  return (
    <Link href={`/agent/${agent.agent_id}`}
      className="group block rounded-xl border border-line bg-panel/70 p-5 transition-colors hover:border-signal/40">
      <div className="flex items-start gap-4">
        <ScoreRing bps={agent.compliance_bps} decided={agent.decided_count} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <ChainTag chain={agent.chain} />
            <StatusTag status={agent.status} />
            {agent.pending_count > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-signal/10 px-2 py-0.5 text-[11px] font-medium text-signal ring-1 ring-signal/25">
                <span className="size-1.5 rounded-full bg-signal live-dot" />
                {agent.pending_count} under judgement
              </span>
            )}
          </div>
          <div className="mono mt-2.5 truncate text-sm text-ink group-hover:text-signal">
            {shortAddress(agent.wallet, 6)}
          </div>
          <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-ink-2">
            {agent.mandate_preview}
          </p>
        </div>
      </div>

      <div className="mono mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-line pt-3.5 text-[11px] text-ink-3">
        <span className="text-ink-2">{formatGen(agent.bond, 3)} GEN bonded</span>
        {agent.violation_count > 0 && (
          <span className="text-violation">{agent.violation_count} breach{agent.violation_count === 1 ? "" : "es"}</span>
        )}
        {agent.compliant_count > 0 && (
          <span className="text-compliant">{agent.compliant_count} cleared</span>
        )}
        <span className="ml-auto">checked {relativeTime(agent.last_checked)}</span>
      </div>
    </Link>
  );
}
