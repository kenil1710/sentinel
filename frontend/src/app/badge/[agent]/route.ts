/**
 *   GET /badge/0x…​.svg?chain=ethereum      GET /badge/12.svg
 *
 * A status badge for a README or a dashboard, drawn from the chain on request
 * (cached 60 s). It says what get_standing says and nothing more.
 */
import { lookup } from "@/lib/server";

export const dynamic = "force-dynamic";

function esc(s: string) {
  return s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c] as string));
}

function svg(right: string, color: string, title: string) {
  const left = "Sentinel";
  const lw = 62, rw = Math.max(60, 7 * right.length + 14), w = lw + rw;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${esc(left)}: ${esc(right)}">
<title>${esc(title)}</title>
<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
<clipPath id="r"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath>
<g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#1C1917"/><rect x="${lw}" width="${rw}" height="20" fill="${color}"/><rect width="${w}" height="20" fill="url(#s)"/></g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
<text x="${lw / 2}" y="14">${esc(left)}</text><text x="${lw + rw / 2}" y="14">${esc(right)}</text></g></svg>`;
}

export async function GET(req: Request, ctx: { params: Promise<{ agent: string }> }) {
  const { agent } = await ctx.params;
  const id = decodeURIComponent(agent).replace(/\.svg$/i, "");
  const chain = (new URL(req.url).searchParams.get("chain") ?? "ethereum").toLowerCase();
  let body: string;
  try {
    const a = /^0x[0-9a-fA-F]{40}$/.test(id) || /^\d{1,9}$/.test(id) ? await lookup(id, chain) : null;
    if (!a) body = svg("not registered", "#6B635C", `${id} is not registered on ${chain}`);
    else if (a.standing.good_standing) body = svg("good standing", "#15803D", `Agent #${a.agent_id} on ${a.chain}: good standing`);
    else body = svg(a.track_record.breaches_total > 0 ? `${a.track_record.breaches_total} breach${a.track_record.breaches_total === 1 ? "" : "es"}` : "not in good standing",
      a.track_record.breaches_total > 0 ? "#B91C1C" : "#B45309", `Agent #${a.agent_id}: ${a.standing.reasons.join("; ")}`);
  } catch {
    body = svg("chain unreachable", "#6B635C", "Studio Dev did not answer");
  }
  return new Response(body, { headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=60" } });
}
