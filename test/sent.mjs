/**
 * A thin Sentinel client for the seed / demo / smoke scripts: every write is
 * fee-estimated, waited to a terminal state and logged; every result is read
 * back from contract state by the caller, never trusted from the receipt.
 */
import { connect, returnedJson } from "./harness.mjs";

export function sentinel(address, role) {
  const c = connect({ address, role });
  const write = async (fn, args = [], value = 0n) => {
    const out = await c.send(fn, args, value);
    const ret = returnedJson(out);
    const line = `  ${role.padEnd(11)} ${fn.padEnd(20)} ${String(out.status).padEnd(12)} ${out.hash ?? ""} ${out.seconds?.toFixed?.(0) ?? "?"}s` +
      (out.reverted && out.revertReason ? `  REVERT: ${String(out.revertReason).slice(0, 160)}` : "") +
      (ret ? `  ${JSON.stringify(ret).slice(0, 220)}` : "");
    console.log(line);
    return { ...out, ret };
  };
  const view = async (fn, args = []) => JSON.parse(await c.view(fn, args));
  return { ...c, write, view, role, address };
}
