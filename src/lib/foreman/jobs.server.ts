/**
 * Shared job logic used by both the manual dashboard buttons (server functions,
 * passcode-gated) and the cron routes (/api/public/cron/*, cron-secret gated).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { reflect, retain } from "./memory.server";

/** Posts "did the fix hold?" into threads whose follow-up is due. */
export async function runCheckFollowups(): Promise<{ posted: number }> {
  const { data: due } = await supabaseAdmin
    .from("actions")
    .select("*")
    .eq("type", "reminder")
    .eq("status", "open")
    .lte("due_at", new Date().toISOString());
  for (const a of due ?? []) {
    await supabaseAdmin.from("messages").insert({
      incident_id: a.incident_id!,
      role: "agent",
      content: `Follow-up: ${(a.payload as { question?: string } | null)?.question ?? "Did the fix hold?"} Please confirm so I can remember the outcome.`,
      card: { kind: "followup" },
    });
    await supabaseAdmin.from("actions").update({ status: "sent" }).eq("id", a.id);
  }
  return { posted: due?.length ?? 0 };
}

/** Proactive scan: finds assets whose recent incidents match earlier patterns and raises risk alerts. */
export async function runScan(): Promise<{ alerts: number }> {
  const since = new Date(Date.now() - 21 * 86400000).toISOString();
  const { data: recent } = await supabaseAdmin.from("incidents").select("*, assets(name)").gte("created_at", since);
  const { data: all } = await supabaseAdmin.from("incidents").select("asset_id,fault_code,created_at");
  const created: { asset_id: string; message: string }[] = [];
  const done = new Set<string>();
  for (const r of recent ?? []) {
    const key = `${r.asset_id}:${r.fault_code}`;
    if (done.has(key)) continue;
    done.add(key);
    const prior = (all ?? []).filter((a) => a.asset_id === r.asset_id && a.fault_code === r.fault_code && a.created_at < r.created_at).length;
    if (prior < 2) continue;
    let insight = "";
    try {
      insight = (
        await reflect(
          `In one sentence: what preceded earlier ${r.fault_code} failures on ${(r as { assets: { name: string } }).assets.name} and what inspection is recommended now?`,
          r.asset_id,
        )
      ).text;
    } catch {
      insight = "";
    }
    const message = `${(r as { assets: { name: string } }).assets.name} matches the pre-failure pattern of ${prior} earlier ${r.fault_code} incidents — recommend inspection before next batch. ${insight.slice(0, 280)}`;
    await supabaseAdmin.from("risk_alerts").delete().eq("asset_id", r.asset_id).eq("dismissed", false);
    await supabaseAdmin.from("risk_alerts").insert({ asset_id: r.asset_id, message, severity: prior >= 3 ? "high" : "medium" });
    created.push({ asset_id: r.asset_id, message });
  }
  // Retain each raised alert so the agent can later learn whether it was right.
  for (const c of created) {
    await retain({
      content: `${new Date().toISOString().slice(0, 10)} · RISK ALERT raised by proactive scan: ${c.message}`,
      asset_id: c.asset_id,
      kind: "risk_alert",
      outcome: "unknown",
    }).catch(() => null);
  }
  await supabaseAdmin.from("memory_events").insert({ kind: "scan", detail: `${created.length} alert(s)` });
  return { alerts: created.length };
}

/** Last/next automatic scan times, derived from the 6-hourly cron schedule. */
export async function scanSchedule(): Promise<{ lastScan: string | null; nextScan: string | null }> {
  const { data } = await supabaseAdmin
    .from("memory_events")
    .select("created_at")
    .eq("kind", "scan")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastScan = data?.created_at ?? null;
  // Cron runs every 6 hours at minute 7 (UTC): 00:07, 06:07, 12:07, 18:07.
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), Math.floor(now.getUTCHours() / 6) * 6 + 6, 7));
  return { lastScan, nextScan: next.toISOString() };
}
