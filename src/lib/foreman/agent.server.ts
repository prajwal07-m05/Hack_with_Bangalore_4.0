/**
 * Foreman agent loop (max 5 steps) with function calling.
 * - Step 0 always runs recall_memory server-side so memory is guaranteed to be consulted.
 * - Malformed/failed tool calls get one repair retry, then the loop falls back to a plain answer.
 * - The thread never crashes: any failure produces a degraded but valid agent message.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { chat, parseJson, type ChatMessage, type ToolDef } from "./llm.server";
import { recall, reflect, retain, type Memory } from "./memory.server";

export type AgentEvent =
  | { type: "step"; tool: string; status: "running" | "done" | "error"; detail?: string }
  | { type: "memories"; memories: Memory[] }
  | { type: "fallback"; reason: string }
  | { type: "done"; messageId: string }
  | { type: "error"; message: string };

export type AgentCard = {
  summary: string;
  memory_empty: boolean;
  similar: { memory_id?: string; date: string; title: string; outcome: string }[];
  hypothesis: { text: string; confidence: number; cited_memory_ids: string[] } | null;
  actions: { type: "capa" | "work_order" | "followup"; label: string; args: Record<string, any> }[];
  do_not_repeat: { fix: string; reason: string; memory_id?: string }[];
  followup_question?: string;
};

const SYSTEM = `You are Foreman, a senior reliability engineer for a pharma/manufacturing plant (plant-hyd-01).
Rules:
- Memory has ALREADY been recalled for you (see RECALLED MEMORIES). You may call recall_memory again with a sharper query, reflect_on_asset, or get_asset_history.
- Cite prior incidents by date and outcome. If a previously suggested fix FAILED, say so explicitly and NEVER recommend it again (list it in do_not_repeat).
- Memories from sibling assets (same machine type, different asset) are weaker evidence; say so explicitly when you use them.
- When memories conflict, show both and prefer the most recent one with a confirmed outcome.
- If memory is empty, say so honestly; give a generic answer and set memory_empty=true ("no plant history yet").
- Do NOT call create_capa/create_work_order/schedule_followup unless the operator explicitly asks you to execute; instead PROPOSE them in "actions" (the operator clicks to execute).
- Use retain_memory only for genuinely new knowledge stated by the operator (corrections, preferences).
- Always end by asking the operator to report the outcome once the fix is applied (followup_question).
FINAL ANSWER: reply with ONLY a JSON object:
{"summary": string (2-4 sentences, markdown ok),
 "memory_empty": boolean,
 "similar": [{"memory_id": string, "date": "YYYY-MM-DD", "title": string, "outcome": "held"|"failed"|"unknown"}],
 "hypothesis": {"text": string, "confidence": number 0-1, "cited_memory_ids": [string]},
 "actions": [{"type": "capa"|"work_order"|"followup", "label": string, "args": object}],
 "do_not_repeat": [{"fix": string, "reason": string, "memory_id": string}],
 "followup_question": string}
Action args: capa → {root_cause, corrective_action, preventive_action}; work_order → {task, priority: "low"|"medium"|"high"}; followup → {days: number, question}.`;

const TOOLS: ToolDef[] = [
  tool("recall_memory", "Recall relevant plant memories from Hindsight", {
    query: { type: "string" },
    asset: { type: "string", description: "asset id, optional" },
  }, ["query"]),
  tool("reflect_on_asset", "Synthesized reasoning over everything known about an asset", { asset: { type: "string" } }, ["asset"]),
  tool("get_asset_history", "Incident + outcome history for an asset from the plant database", { asset_id: { type: "string" } }, ["asset_id"]),
  tool("create_capa", "Create a CAPA record", {
    incident_id: { type: "string" }, root_cause: { type: "string" }, corrective_action: { type: "string" }, preventive_action: { type: "string" },
  }, ["incident_id", "root_cause", "corrective_action", "preventive_action"]),
  tool("create_work_order", "Create a maintenance work order", {
    asset_id: { type: "string" }, task: { type: "string" }, priority: { type: "string", enum: ["low", "medium", "high"] },
  }, ["asset_id", "task", "priority"]),
  tool("schedule_followup", "Schedule a 'did the fix hold?' follow-up", {
    incident_id: { type: "string" }, days: { type: "number" }, question: { type: "string" },
  }, ["incident_id", "days", "question"]),
  tool("retain_memory", "Store a new memory (operator correction/preference/new fact)", {
    content: { type: "string" }, tags: { type: "array", items: { type: "string" } },
  }, ["content"]),
];

function tool(name: string, description: string, properties: Record<string, unknown>, required: string[]): ToolDef {
  return { type: "function", function: { name, description, parameters: { type: "object", properties, required } } };
}

/** Executes actions (shared by agent tool calls and the one-click buttons in the UI). */
export async function executeAction(type: string, args: any, incidentId: string | null, assetId: string | null) {
  if (type === "capa" || type === "create_capa") {
    const { data } = await supabaseAdmin.from("actions").insert({
      incident_id: incidentId, asset_id: assetId, type: "capa",
      payload: { root_cause: args.root_cause, corrective_action: args.corrective_action, preventive_action: args.preventive_action },
    }).select().single();
    return { ok: true, id: data?.id, summary: `CAPA created: ${args.root_cause}` };
  }
  if (type === "work_order" || type === "create_work_order") {
    const { data } = await supabaseAdmin.from("actions").insert({
      incident_id: incidentId, asset_id: args.asset_id ?? assetId, type: "work_order",
      payload: { task: args.task, priority: args.priority ?? "medium" },
    }).select().single();
    return { ok: true, id: data?.id, summary: `Work order (${args.priority ?? "medium"}): ${args.task}` };
  }
  if (type === "followup" || type === "schedule_followup") {
    const days = Number(args.days) || 3;
    const { data } = await supabaseAdmin.from("actions").insert({
      incident_id: incidentId, asset_id: assetId, type: "reminder",
      payload: { question: args.question ?? "Did the fix hold?" },
      due_at: new Date(Date.now() + days * 86400000).toISOString(),
    }).select().single();
    return { ok: true, id: data?.id, summary: `Follow-up in ${days} day(s): ${args.question ?? "Did the fix hold?"}` };
  }
  throw new Error(`Unknown action ${type}`);
}

async function runTool(name: string, args: any, ctx: { incidentId: string; assetId: string }, seen: Map<string, Memory>) {
  switch (name) {
    case "recall_memory": {
      const { memories: mems } = await recall(String(args.query ?? ""), { asset: args.asset ?? null });
      mems.forEach((m) => seen.set(m.id, m));
      return mems.map(fmtMem).join("\n") || "No memories found.";
    }
    case "reflect_on_asset":
      return (await reflect(`What patterns, recurring failures and proven fixes do we know for asset ${args.asset}?`, args.asset)).text;
    case "get_asset_history": {
      const { data } = await supabaseAdmin.from("incidents").select("title,fault_code,created_at,status,outcomes(fix_summary,held)")
        .eq("asset_id", args.asset_id ?? ctx.assetId).order("created_at", { ascending: false }).limit(15);
      return JSON.stringify(data ?? []);
    }
    case "create_capa":
    case "create_work_order":
    case "schedule_followup":
      return JSON.stringify(await executeAction(name, args, args.incident_id ?? ctx.incidentId, ctx.assetId));
    case "retain_memory":
      await retain({ content: String(args.content), asset_id: ctx.assetId, kind: "operator_note" });
      return "Retained.";
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}

const fmtMem = (m: Memory) => `[id:${m.id}] ${m.occurred_at.slice(0, 10)} asset=${m.asset_id ?? "?"}${m.sibling ? ` (SIBLING ASSET ${m.sibling} — weaker evidence)` : ""} outcome=${m.outcome.toUpperCase()} :: ${m.content}`;

export async function runAgent(incidentId: string, emit: (e: AgentEvent) => void) {
  const { data: inc } = await supabaseAdmin.from("incidents").select("*, assets(*)").eq("id", incidentId).single();
  if (!inc) throw new Error("Incident not found");
  const { data: history } = await supabaseAdmin.from("messages").select("role,content").eq("incident_id", incidentId)
    .order("created_at", { ascending: true }).limit(30);
  const asset = (inc as any).assets;
  const lastOperator = [...(history ?? [])].reverse().find((m) => m.role === "operator")?.content ?? inc.description;
  const seen = new Map<string, Memory>();
  const toolLog: { tool: string; args: unknown; ok: boolean }[] = [];

  // Step 0 — mandatory recall
  emit({ type: "step", tool: "recall_memory", status: "running", detail: `${asset.name}: ${inc.fault_code ?? ""} ${inc.title}` });
  let recalled: Memory[] = [];
  try {
    // Two recalls: this asset, and sibling machines of the same type. Merge + de-dupe.
    const q = `${asset.name} ${asset.type} ${inc.fault_code ?? ""} ${inc.title} ${lastOperator}`;
    const typeTag = `type:${asset.type.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    const [own, sib] = await Promise.all([recall(q, { asset: inc.asset_id, limit: 8 }), recall(q, { tag: typeTag, limit: 6 })]);
    const { data: assetsAll } = await supabaseAdmin.from("assets").select("id,name");
    const names = new Map((assetsAll ?? []).map((x) => [x.id, x.name]));
    const byKey = new Map<string, Memory>();
    for (const m of [...own.memories, ...sib.memories]) {
      const key = m.content.slice(0, 120);
      if (byKey.has(key)) continue;
      byKey.set(key, { ...m, sibling: m.asset_id && m.asset_id !== inc.asset_id ? (names.get(m.asset_id) ?? m.asset_id) : null });
    }
    recalled = [...byKey.values()];
    recalled.forEach((m) => seen.set(m.id, m));
    if (own.source === "local" || sib.source === "local") emit({ type: "fallback", reason: own.fallbackReason ?? sib.fallbackReason ?? "Hindsight unavailable" });
    toolLog.push({ tool: "recall_memory", args: { asset: inc.asset_id, sibling_tag: typeTag }, ok: true });
    emit({ type: "step", tool: "recall_memory", status: "done", detail: `${recalled.length} memories · ${own.source === "hindsight" ? "Hindsight" : "local fallback"}` });
  } catch (e) {
    emit({ type: "step", tool: "recall_memory", status: "error", detail: String(e) });
  }
  emit({ type: "memories", memories: recalled });

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: `INCIDENT ${inc.id}\nAsset: ${asset.name} (id ${asset.id}, ${asset.type}, ${asset.line})\nTitle: ${inc.title}\nSeverity: ${inc.severity}  Fault: ${inc.fault_code}  Batch: ${inc.batch_no}\nDescription: ${inc.description}\n\nTHREAD:\n${(history ?? []).map((m) => `${m.role}: ${m.content.slice(0, 600)}`).join("\n")}\n\nRECALLED MEMORIES:\n${recalled.map(fmtMem).join("\n") || "(none — no plant history yet)"}`,
    },
  ];

  let card: AgentCard | null = null;
  let plain = "";
  let repaired = false;
  for (let step = 0; step < 5 && !card; step++) {
    let res;
    try {
      res = await chat({ messages, tools: TOOLS });
    } catch (e) {
      emit({ type: "step", tool: "llm", status: "error", detail: String(e).slice(0, 160) });
      break;
    }
    if (res.tool_calls.length) {
      messages.push({ role: "assistant", content: res.content || null, tool_calls: res.tool_calls });
      for (const tc of res.tool_calls) {
        emit({ type: "step", tool: tc.function.name, status: "running", detail: tc.function.arguments.slice(0, 120) });
        let out: string;
        try {
          const args = JSON.parse(tc.function.arguments || "{}");
          out = await runTool(tc.function.name, args, { incidentId, assetId: inc.asset_id }, seen);
          toolLog.push({ tool: tc.function.name, args, ok: true });
          emit({ type: "step", tool: tc.function.name, status: "done" });
        } catch (e) {
          toolLog.push({ tool: tc.function.name, args: tc.function.arguments, ok: false });
          emit({ type: "step", tool: tc.function.name, status: "error", detail: String(e).slice(0, 120) });
          out = `ERROR: ${String(e)}. Fix the arguments (valid JSON matching the schema) or answer without this tool.`;
        }
        messages.push({ role: "tool", tool_call_id: tc.id, name: tc.function.name, content: out.slice(0, 6000) });
      }
      emit({ type: "memories", memories: [...seen.values()] });
      continue;
    }
    const parsed = parseJson<AgentCard>(res.content);
    if (parsed?.summary) {
      card = parsed;
    } else if (!repaired) {
      repaired = true;
      plain = res.content;
      emit({ type: "step", tool: "repair", status: "running", detail: "Reformatting answer" });
      messages.push({ role: "assistant", content: res.content });
      messages.push({ role: "user", content: "Your reply was not valid JSON. Reply again with ONLY the JSON object in the required schema." });
    } else {
      plain = res.content || plain;
      break;
    }
  }

  if (!card) {
    card = {
      summary: plain || "I couldn't complete the full analysis right now (AI service unavailable). Here are the memories I recalled — please review them.",
      memory_empty: recalled.length === 0,
      similar: recalled.slice(0, 4).map((m) => ({ memory_id: m.id, date: m.occurred_at.slice(0, 10), title: m.content.slice(0, 90), outcome: m.outcome })),
      hypothesis: null,
      actions: [],
      do_not_repeat: recalled.filter((m) => m.outcome === "failed").map((m) => ({ fix: m.content.slice(0, 120), reason: "Failed previously", memory_id: m.id })),
    };
  }
  card.similar ??= [];
  card.actions ??= [];
  card.do_not_repeat ??= [];

  const cited = new Set([...(card.hypothesis?.cited_memory_ids ?? []), ...card.similar.map((s) => s.memory_id), ...card.do_not_repeat.map((d) => d.memory_id)].filter(Boolean) as string[]);
  const memoriesUsed = [...seen.values()].map((m) => ({ ...m, influenced: cited.has(m.id) }));

  const { data: msg } = await supabaseAdmin.from("messages").insert({
    incident_id: incidentId, role: "agent", content: card.summary, card: card as any,
    memories_used: memoriesUsed as any, tool_calls: toolLog as any,
  }).select("id").single();
  emit({ type: "done", messageId: msg!.id });
}
