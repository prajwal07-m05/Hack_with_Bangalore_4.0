/**
 * Server functions for Foreman. All DB access uses the service-role client on the server;
 * Hindsight + LLM calls stay server-side so keys never reach the browser.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const db = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin;
const mem = () => import("./memory.server");

/* ---------------- Reads ---------------- */

export const getDashboard = createServerFn({ method: "GET" }).handler(async () => {
  const s = await db();
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const [open, alerts, memCount, recalls, outcomes, incidents, due] = await Promise.all([
    s.from("incidents").select("*, assets(name,line)").eq("status", "open").order("created_at", { ascending: false }),
    s.from("risk_alerts").select("*, assets(name)").eq("dismissed", false).order("created_at", { ascending: false }).limit(8),
    s.from("memories").select("id", { count: "exact", head: true }),
    s.from("memory_events").select("id", { count: "exact", head: true }).eq("kind", "recall").gte("created_at", weekAgo),
    s.from("outcomes").select("held"),
    s.from("incidents").select("fault_code,created_at"),
    s.from("actions").select("id", { count: "exact", head: true }).eq("type", "reminder").eq("status", "open").lte("due_at", new Date().toISOString()),
  ]);
  const { count: retainFailed } = await s.from("memory_events").select("id", { count: "exact", head: true }).eq("kind", "retain_failed");
  // Recurring-failure trend: monthly counts for the top 3 recurring fault codes
  const counts = new Map<string, number>();
  (incidents.data ?? []).forEach((i) => i.fault_code && counts.set(i.fault_code, (counts.get(i.fault_code) ?? 0) + 1));
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
  const months = new Map<string, Record<string, number | string>>();
  (incidents.data ?? []).forEach((i) => {
    const m = i.created_at.slice(0, 7);
    if (!months.has(m)) months.set(m, Object.fromEntries([["month", m], ...top.map((t) => [t, 0])]));
    if (i.fault_code && top.includes(i.fault_code)) {
      const row = months.get(m)!;
      row[i.fault_code] = Number(row[i.fault_code] ?? 0) + 1;
    }
  });
  return {
    open: open.data ?? [],
    alerts: alerts.data ?? [],
    stats: {
      memories: memCount.count ?? 0,
      recallsWeek: recalls.count ?? 0,
      held: (outcomes.data ?? []).filter((o) => o.held === true).length,
      failed: (outcomes.data ?? []).filter((o) => o.held === false).length,
      retainFailed: retainFailed ?? 0,
    },
    dueFollowups: due.count ?? 0,
    trend: { codes: top, data: [...months.values()].sort((a, b) => String(a["month"]).localeCompare(String(b["month"]))) },
  };
});

export const listIncidents = createServerFn({ method: "GET" }).handler(async () => {
  const s = await db();
  const [inc, assets] = await Promise.all([
    s.from("incidents").select("*, assets(name,line)").order("created_at", { ascending: false }),
    s.from("assets").select("*").order("name"),
  ]);
  return { incidents: inc.data ?? [], assets: assets.data ?? [] };
});

export const getIncident = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const s = await db();
    const [inc, msgs, actions, outcomes] = await Promise.all([
      s.from("incidents").select("*, assets(*)").eq("id", data.id).single(),
      s.from("messages").select("*").eq("incident_id", data.id).order("created_at"),
      s.from("actions").select("*").eq("incident_id", data.id).order("created_at"),
      s.from("outcomes").select("*").eq("incident_id", data.id).order("created_at"),
    ]);
    if (!inc.data) throw new Error("Incident not found");
    return { incident: inc.data, messages: msgs.data ?? [], actions: actions.data ?? [], outcomes: outcomes.data ?? [] };
  });

export const listAssets = createServerFn({ method: "GET" }).handler(async () => {
  const s = await db();
  const { data } = await s.from("assets").select("*, incidents(id,status,severity,created_at)").order("name");
  return data ?? [];
});

export const getAsset = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const s = await db();
    const [asset, inc, alerts] = await Promise.all([
      s.from("assets").select("*").eq("id", data.id).single(),
      s.from("incidents").select("*, outcomes(*)").eq("asset_id", data.id).order("created_at", { ascending: false }),
      s.from("risk_alerts").select("*").eq("asset_id", data.id).eq("dismissed", false),
    ]);
    if (!asset.data) throw new Error("Asset not found");
    return { asset: asset.data, incidents: inc.data ?? [], alerts: alerts.data ?? [] };
  });

/** "What Foreman knows about this asset" — Hindsight mental model (falls back to reflect). */
export const assetKnowledge = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const s = await db();
    const { data: asset } = await s.from("assets").select("id,name").eq("id", data.id).single();
    if (!asset) throw new Error("Asset not found");
    const m = await mem();
    const [knowledge, obs] = await Promise.all([m.assetKnowledge(asset), m.observations(asset.id)]);
    return { knowledge, observations: obs };
  });

export const refreshAssetKnowledge = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => (await mem()).refreshAssetKnowledge(data.id));

export const healthCheck = createServerFn({ method: "GET" }).handler(async () => {
  const h = await (await mem()).healthCheck();
  return { status: h.status, detail: h.detail };
});

export const indexingStatus = createServerFn({ method: "GET" }).handler(async () => (await mem()).indexingStatus());

export const retagMemories = createServerFn({ method: "POST" }).handler(async () => (await mem()).retagAll());

/* ---------------- Writes ---------------- */

export const createIncident = createServerFn({ method: "POST" })
  .validator(
    z.object({
      asset_id: z.string().min(1),
      title: z.string().min(3).max(200),
      description: z.string().max(4000),
      severity: z.enum(["low", "medium", "high", "critical"]),
      fault_code: z.string().max(40).optional(),
      batch_no: z.string().max(40).optional(),
      technician: z.string().max(80).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const s = await db();
    const { data: inc, error } = await s.from("incidents").insert({ ...data, fault_code: data.fault_code ?? null, batch_no: data.batch_no ?? null, technician: data.technician ?? null, status: "open" }).select("*, assets(name,type,line)").single();
    if (error) throw error;
    await s.from("messages").insert({ incident_id: inc.id, role: "operator", content: `${data.technician ?? "Operator"}: ${data.description}` });
    const { retain } = await mem();
    const a = (inc as any).assets;
    // retain on incident creation
    await retain({
      content: `${inc.created_at.slice(0, 10)} · NEW INCIDENT on ${a.name} (${a.type}, ${a.line}) · ${data.fault_code ?? ""} · batch ${data.batch_no ?? "-"} · severity ${data.severity}: ${data.title}. ${data.description}`,
      asset_id: data.asset_id, kind: "incident", outcome: "unknown",
    }).catch(() => null);
    return { id: inc.id };
  });

/** Operator message. Detects corrections & preferences and retains them. Returns whether @Foreman was tagged. */
export const postMessage = createServerFn({ method: "POST" })
  .validator(z.object({ incidentId: z.string().uuid(), content: z.string().min(1).max(4000) }))
  .handler(async ({ data }) => {
    const s = await db();
    await s.from("messages").insert({ incident_id: data.incidentId, role: "operator", content: data.content });
    const { data: inc } = await s.from("incidents").select("asset_id, assets(name)").eq("id", data.incidentId).single();
    const text = data.content.replace(/@foreman/gi, "").trim();
    // LLM classification of what (if anything) is worth remembering. On any failure → "none".
    let cls: { kind: "correction" | "preference" | "fact" | "none"; content: string } = { kind: "none", content: "" };
    if (text.length > 3) {
      try {
        const { chat, parseJson } = await import("./llm.server");
        const res = await chat({
          json: true,
          timeoutMs: 15000,
          messages: [
            { role: "system", content: 'Classify an operator message in a plant incident thread. Return JSON {"kind": "correction"|"preference"|"fact"|"none", "content": string}. correction = operator corrects the agent or a prior diagnosis; preference = how the operator wants things done; fact = new concrete technical observation worth remembering (measurements, parts, findings); none = questions, chit-chat, requests. "content" = a self-contained one-sentence memory (include asset name), empty for none.' },
            { role: "user", content: `Asset: ${(inc as any)?.assets?.name}\nMessage: ${text}` },
          ],
        });
        const j = parseJson<typeof cls>(res.content);
        if (j && ["correction", "preference", "fact", "none"].includes(j.kind)) cls = { kind: j.kind, content: String(j.content ?? "") };
      } catch {
        cls = { kind: "none", content: "" };
      }
    }
    const { retain } = await mem();
    let retained: string | null = null;
    if (cls.kind !== "none" && cls.content) {
      await retain({ content: `${new Date().toISOString().slice(0, 10)} · OPERATOR ${cls.kind.toUpperCase()}: ${cls.content}`, asset_id: inc?.asset_id, kind: cls.kind, outcome: "unknown" }).catch(() => null);
      retained = cls.kind;
    }
    return { triggerAgent: /@foreman/i.test(data.content), retained };
  });

export const runAction = createServerFn({ method: "POST" })
  .validator(z.object({ incidentId: z.string().uuid(), type: z.enum(["capa", "work_order", "followup"]), args: z.record(z.any()) }))
  .handler(async ({ data }) => {
    const s = await db();
    const { data: inc } = await s.from("incidents").select("asset_id").eq("id", data.incidentId).single();
    const { executeAction } = await import("./agent.server");
    const res = await executeAction(data.type, data.args, data.incidentId, inc?.asset_id ?? null);
    await s.from("messages").insert({ incident_id: data.incidentId, role: "system", content: `✓ ${res.summary}` });
    return res;
  });

export const resolveIncident = createServerFn({ method: "POST" })
  .validator(z.object({ incidentId: z.string().uuid(), fix: z.string().min(3).max(1000) }))
  .handler(async ({ data }) => {
    const s = await db();
    const now = new Date().toISOString();
    const { data: inc } = await s.from("incidents").update({ status: "resolved", resolved_at: now }).eq("id", data.incidentId).select("*, assets(name,type,line)").single();
    await s.from("messages").insert({ incident_id: data.incidentId, role: "system", content: `Resolved: ${data.fix}` });
    await s.from("outcomes").insert({ incident_id: data.incidentId, fix_summary: data.fix, held: null });
    // schedule automatic "did it hold?" follow-up
    await s.from("actions").insert({ incident_id: data.incidentId, asset_id: inc?.asset_id ?? null, type: "reminder", payload: { question: `Did "${data.fix}" hold?` }, due_at: new Date(Date.now() + 3 * 86400000).toISOString() });
    const a = (inc as any)?.assets;
    const { retain } = await mem();
    await retain({ content: `${now.slice(0, 10)} · RESOLUTION on ${a?.name} · ${inc?.fault_code}: ${inc?.title}. Fix applied: ${data.fix}. Outcome pending.`, asset_id: inc?.asset_id, kind: "resolution", outcome: "unknown" }).catch(() => null);
    return { ok: true };
  });

/** Outcome of a fix (held / failed). Retained so Foreman never repeats failed fixes. */
export const recordOutcome = createServerFn({ method: "POST" })
  .validator(z.object({ incidentId: z.string().uuid(), held: z.boolean(), notes: z.string().max(1000).optional() }))
  .handler(async ({ data }) => {
    const s = await db();
    const { data: inc } = await s.from("incidents").select("*, assets(name), outcomes(*)").eq("id", data.incidentId).single();
    const last = ((inc as any)?.outcomes ?? []).sort((a: any, b: any) => b.created_at.localeCompare(a.created_at))[0];
    const fix = last?.fix_summary ?? "the applied fix";
    if (last && last.held === null) await s.from("outcomes").update({ held: data.held, followup_notes: data.notes ?? "" }).eq("id", last.id);
    else await s.from("outcomes").insert({ incident_id: data.incidentId, fix_summary: fix, held: data.held, followup_notes: data.notes ?? "" });
    if (!data.held) await s.from("incidents").update({ status: "open", resolved_at: null }).eq("id", data.incidentId);
    await s.from("actions").update({ status: "done" }).eq("incident_id", data.incidentId).eq("type", "reminder");
    await s.from("messages").insert({ incident_id: data.incidentId, role: "system", content: `Outcome recorded: fix ${data.held ? "HELD ✓" : "FAILED ✗ — incident reopened"}${data.notes ? ` — ${data.notes}` : ""}` });
    const { retain } = await mem();
    await retain({
      content: `${new Date().toISOString().slice(0, 10)} · OUTCOME on ${(inc as any)?.assets?.name} · ${inc?.fault_code}: fix "${fix}" ${data.held ? "HELD" : "FAILED — do not repeat as sole fix"}. ${data.notes ?? ""}`,
      asset_id: inc?.asset_id, kind: "outcome", outcome: data.held ? "held" : "failed",
    }).catch(() => null);
    return { ok: true };
  });

/** Posts "did the fix hold?" into threads whose follow-up is due. */
export const checkFollowups = createServerFn({ method: "POST" }).handler(async () => {
  const s = await db();
  const { data: due } = await s.from("actions").select("*").eq("type", "reminder").eq("status", "open").lte("due_at", new Date().toISOString());
  for (const a of due ?? []) {
    await s.from("messages").insert({
      incident_id: a.incident_id!, role: "agent",
      content: `Follow-up: ${(a.payload as any)?.question ?? "Did the fix hold?"} Please confirm so I can remember the outcome.`,
      card: { kind: "followup" },
    });
    await s.from("actions").update({ status: "sent" }).eq("id", a.id);
  }
  return { posted: due?.length ?? 0 };
});

/** Admin: bulk-retain the seeded plant history into Hindsight (one memory per incident, chronological). */
export const loadPlantHistory = createServerFn({ method: "POST" }).handler(async () => {
  const s = await db();
  const { count } = await s.from("memories").select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0) return { retained: 0, skipped: true };
  const { data: inc } = await s.from("incidents").select("*, assets(name,type,line), outcomes(*)").order("created_at");
  const items = (inc ?? []).map((i: any) => {
    const o = i.outcomes?.[0];
    const outcome = o ? (o.held === true ? "held" : o.held === false ? "failed" : "unknown") : "unknown";
    return {
      content: `${i.created_at.slice(0, 10)} · ${i.assets.name} (${i.assets.type}, ${i.assets.line}) · ${i.fault_code} · batch ${i.batch_no} · tech ${i.technician}: ${i.title}. ${i.description}${o ? ` Fix: ${o.fix_summary}. Outcome: ${outcome.toUpperCase()}${o.followup_notes ? ` — ${o.followup_notes}` : ""}.` : " Status: still open."}`,
      asset_id: i.asset_id, kind: "incident", outcome, occurred_at: i.created_at,
    };
  });
  const { retain } = await mem();
  for (let k = 0; k < items.length; k += 10) await retain(items.slice(k, k + 10));
  return { retained: items.length, skipped: false };
});

/** Proactive scan: finds assets whose open/recent incidents match earlier patterns and raises risk alerts. */
export const runProactiveScan = createServerFn({ method: "POST" }).handler(async () => {
  const s = await db();
  const since = new Date(Date.now() - 21 * 86400000).toISOString();
  const { data: recent } = await s.from("incidents").select("*, assets(name)").gte("created_at", since);
  const { data: all } = await s.from("incidents").select("asset_id,fault_code,created_at");
  const { reflect } = await mem();
  const created: string[] = [];
  const done = new Set<string>();
  for (const r of recent ?? []) {
    const key = `${r.asset_id}:${r.fault_code}`;
    if (done.has(key)) continue;
    done.add(key);
    const prior = (all ?? []).filter((a) => a.asset_id === r.asset_id && a.fault_code === r.fault_code && a.created_at < r.created_at).length;
    if (prior < 2) continue;
    let insight = "";
    try {
      insight = (await reflect(`In one sentence: what preceded earlier ${r.fault_code} failures on ${(r as any).assets.name} and what inspection is recommended now?`, r.asset_id)).text;
    } catch {
      insight = "";
    }
    const message = `${(r as any).assets.name} matches the pre-failure pattern of ${prior} earlier ${r.fault_code} incidents — recommend inspection before next batch. ${insight.slice(0, 280)}`;
    await s.from("risk_alerts").delete().eq("asset_id", r.asset_id).eq("dismissed", false);
    await s.from("risk_alerts").insert({ asset_id: r.asset_id, message, severity: prior >= 3 ? "high" : "medium" });
    created.push(r.asset_id);
  }
  return { alerts: created.length };
});

export const dismissAlert = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const s = await db();
    await s.from("risk_alerts").update({ dismissed: true }).eq("id", data.id);
    return { ok: true };
  });

/** Shift handover brief: recent incidents + recalled patterns → risks for the next shift. */
export const generateHandover = createServerFn({ method: "POST" }).handler(async () => {
  const s = await db();
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: recent } = await s.from("incidents").select("title,fault_code,severity,status,description,created_at,assets(name)").or(`status.eq.open,created_at.gte.${since}`);
  const { recall } = await mem();
  const { memories: mems } = await recall(`recurring failures risks ${(recent ?? []).map((r: any) => `${r.assets.name} ${r.fault_code}`).join(" ")}`, { limit: 12 });
  const { chat, parseJson } = await import("./llm.server");
  let brief: any = null;
  try {
    const res = await chat({
      json: true,
      messages: [
        { role: "system", content: 'You are Foreman writing a shift handover brief. Return JSON: {"headline": string, "risks": [{"asset": string, "risk": string, "why": string (cite past incidents by date/outcome), "action": string, "severity": "low"|"medium"|"high"}], "watch_items": [string]}. Max 5 risks.' },
        { role: "user", content: `Recent/open incidents:\n${JSON.stringify(recent)}\n\nRecalled memories:\n${mems.map((m) => `- ${m.occurred_at.slice(0, 10)} (${m.outcome}) ${m.content}`).join("\n") || "(no plant history yet)"}` },
      ],
    });
    brief = parseJson(res.content);
  } catch (e) {
    console.error(e);
  }
  brief ??= { headline: "AI unavailable — open incidents listed below.", risks: (recent ?? []).filter((r: any) => r.status === "open").map((r: any) => ({ asset: r.assets.name, risk: r.title, why: r.description, action: "Review before next batch", severity: r.severity === "critical" ? "high" : r.severity })), watch_items: [] };
  brief.memories = mems;
  const { data } = await s.from("handovers").insert({ brief }).select().single();
  return data!;
});

export const latestHandover = createServerFn({ method: "GET" }).handler(async () => {
  const s = await db();
  const { data } = await s.from("handovers").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data;
});

/** Memory Lab: same prompt answered without memory vs with the first N memories the plant accumulated. */
export const memoryLab = createServerFn({ method: "POST" })
  .validator(z.object({ prompt: z.string().min(3).max(1000), upTo: z.number().int().min(1).max(500) }))
  .handler(async ({ data }) => {
    const { recallFirstN } = await mem();
    const { chat } = await import("./llm.server");
    const rec = await recallFirstN(data.prompt, data.upTo, 6);
    const mems = rec.memories;
    const sys = "You are Foreman, a senior reliability engineer. Answer in max 6 short bullet points: likely root cause, recommended fix, what NOT to do. Be specific when you have plant history; if none, say 'No plant history yet' and give generic advice.";
    const [off, on] = await Promise.all([
      chat({ messages: [{ role: "system", content: sys }, { role: "user", content: data.prompt }] }).then((r) => r.content).catch((e) => `Error: ${e.message}`),
      chat({ messages: [{ role: "system", content: sys }, { role: "user", content: `${data.prompt}\n\nPLANT MEMORY (cite dates and outcomes; never repeat failed fixes):\n${mems.map((m) => `- ${m.occurred_at.slice(0, 10)} [${m.outcome.toUpperCase()}] ${m.content}`).join("\n") || "(none)"}` }] }).then((r) => r.content).catch((e) => `Error: ${e.message}`),
    ]);
    return { off, on, memories: mems, source: rec.source, fallbackReason: rec.fallbackReason };
  });

export const memoryCount = createServerFn({ method: "GET" }).handler(async () => {
  const s = await db();
  const { count } = await s.from("memories").select("id", { count: "exact", head: true });
  return count ?? 0;
});
