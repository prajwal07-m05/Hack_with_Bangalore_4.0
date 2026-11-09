/**
 * Hindsight memory layer — bank "plant-hyd-01". ALL Hindsight calls live in this file.
 *
 * Endpoints used (verified against https://hindsight.vectorize.io/openapi.json):
 *   PUT    /v1/default/banks/{bank}                         create/update bank (missions, disposition)
 *   PATCH  /v1/default/banks/{bank}/config                  { updates: { memory_defense, enable_observations, … } }
 *   GET    /v1/default/banks/{bank}/stats                   health + indexing progress (pending_operations)
 *   POST   /v1/default/banks/{bank}/memories                retain  { items[], async }
 *   POST   /v1/default/banks/{bank}/memories/recall         recall  { query, budget, max_tokens, tags, tags_match, types }
 *   POST   /v1/default/banks/{bank}/reflect                 reflect { query, budget, tags }
 *   GET    /v1/default/banks/{bank}/memories/list?type=observation   observations with proof_count
 *   GET/POST /v1/default/banks/{bank}/mental-models[/{id}[/refresh]] per-asset mental models
 *
 * The local `memories` table mirrors every retain. It is used as a fallback, but never silently:
 * every recall reports its `source`, and fallback reasons are surfaced to the UI.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { chat } from "./llm.server";

export const BANK_ID = "plant-hyd-01";
const DEFAULT_BASE = "https://api.hindsight.vectorize.io";

export type MemorySource = "hindsight" | "local";
export type Memory = {
  id: string;
  content: string;
  asset_id: string | null;
  outcome: string;
  kind: string;
  occurred_at: string;
  score?: number;
  source: MemorySource;
  sibling?: string | null;
};
export type RecallResult = { memories: Memory[]; source: MemorySource; fallbackReason: string | null };

function config() {
  const key = process.env["HINDSIGHT_API_KEY"];
  if (!key) return null;
  return { key, base: (process.env["HINDSIGHT_BASE_URL"] || DEFAULT_BASE).replace(/\/$/, "") };
}
export const hindsightConfigured = () => !!config();

class HindsightError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

async function hs(method: string, path: string, body?: unknown, timeoutMs = 20000): Promise<any> {
  const c = config();
  if (!c) throw new HindsightError("Hindsight not configured");
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${c.base}/v1/default/banks/${BANK_ID}${path}`, {
        method,
        headers: { Authorization: `Bearer ${c.key}`, "Content-Type": "application/json" },
        body: body === undefined ? null : JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 700 * 2 ** attempt)); // backoff queue for rate limits
        continue;
      }
      if (!res.ok) throw new HindsightError(`Hindsight ${res.status}: ${(await res.text()).slice(0, 200)}`, res.status);
      const txt = await res.text();
      return txt ? JSON.parse(txt) : {};
    } catch (e) {
      if (e instanceof HindsightError) throw e;
      if (attempt === 2) throw new HindsightError(e instanceof Error && e.name === "AbortError" ? "Hindsight timeout" : String(e));
    } finally {
      clearTimeout(t);
    }
  }
  throw new HindsightError("Hindsight rate limited");
}

async function logEvent(kind: string, detail?: string) {
  await supabaseAdmin.from("memory_events").insert({ kind, detail: detail?.slice(0, 300) ?? null });
}

/* ---------------- Bank setup (missions, disposition, Memory Defense) ---------------- */

let bankReady: Promise<void> | null = null;
export function ensureBank() {
  if (!config()) return Promise.resolve();
  bankReady ??= (async () => {
    await hs("PUT", "", {
      reflect_mission:
        "You are the institutional memory of a pharma manufacturing plant, reasoning like a skeptical senior reliability engineer. Prefer confirmed outcomes over hunches, call out fixes that failed, weigh recent evidence more, and say when evidence is thin or comes from a different (sibling) asset.",
      retain_mission:
        "Extract equipment, fault codes, batch and lubricant lot numbers, symptoms, measured values, fixes applied, outcomes (held/failed) and root causes. Keep dates.",
      enable_observations: true,
      observations_mission:
        "Consolidate recurring failure modes per asset, which fixes reliably held, which fixes failed, and early-warning signs that preceded failures.",
      disposition_skepticism: 5,
      disposition_literalism: 4,
      disposition_empathy: 2,
    });
    // Memory Defense: redact secrets / PII from operator notes before they are stored.
    await hs("PATCH", "/config", {
      updates: {
        memory_defense: {
          enabled: true,
          default_action: "allow",
          rules: [
            { on: "sensitive_data", action: "redact", min_severity: "low" },
          ],
        },
      },
    }).catch((e) => console.error("memory_defense config rejected (may require Hindsight Enterprise)", e));
    await logEvent("bank_configured");
  })().catch((e) => {
    bankReady = null;
    throw e;
  });
  return bankReady;
}

/* ---------------- Health ---------------- */

export type HealthStatus = "connected" | "fallback" | "not_configured";
let healthCache: { at: number; status: HealthStatus; detail: string | null } | null = null;
export async function healthCheck() {
  if (!config()) return { status: "not_configured" as HealthStatus, detail: null };
  if (healthCache && Date.now() - healthCache.at < 30_000) return healthCache;
  try {
    await ensureBank();
    await hs("GET", "/stats", undefined, 8000);
    healthCache = { at: Date.now(), status: "connected", detail: null };
  } catch (e) {
    healthCache = { at: Date.now(), status: "fallback", detail: (e as Error).message };
  }
  return healthCache;
}

/** Indexing progress: retain is async, so poll stats until no operations are pending. */
export async function indexingStatus() {
  const { count: local } = await supabaseAdmin.from("memories").select("id", { count: "exact", head: true });
  if (!config()) return { ready: true, pending: 0, indexed: local ?? 0, local: local ?? 0, source: "local" as MemorySource };
  try {
    const s = await hs("GET", "/stats?refresh=true", undefined, 8000);
    const pending = Number(s.pending_operations ?? 0);
    return { ready: pending === 0, pending, indexed: Number(s.total_documents ?? 0), local: local ?? 0, source: "hindsight" as MemorySource };
  } catch (e) {
    return { ready: true, pending: 0, indexed: 0, local: local ?? 0, source: "local" as MemorySource, error: (e as Error).message };
  }
}

/* ---------------- Retain ---------------- */

type RetainInput = {
  content: string;
  asset_id?: string | null | undefined;
  outcome?: string | undefined;
  kind?: string | undefined;
  occurred_at?: string | undefined;
};

type AssetMeta = { id: string; type: string; line: string; name: string };
async function assetMap(): Promise<Map<string, AssetMeta>> {
  const { data } = await supabaseAdmin.from("assets").select("id,type,line,name");
  return new Map((data ?? []).map((a) => [a.id, a]));
}
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
function tagsFor(m: { asset_id: string | null; outcome: string; kind: string }, assets: Map<string, AssetMeta>) {
  const a = m.asset_id ? assets.get(m.asset_id) : undefined;
  return [
    m.asset_id && `asset:${m.asset_id}`,
    a && `type:${slug(a.type)}`,
    a && `line:${slug(a.line)}`,
    `outcome:${m.outcome}`,
    `kind:${m.kind}`,
  ].filter(Boolean) as string[];
}

async function pushToHindsight(rows: { id: string; content: string; asset_id: string | null; outcome: string; kind: string; tags: string[]; occurred_at: string }[]) {
  await ensureBank();
  await hs("POST", "/memories", {
    async: true,
    items: rows.map((r) => ({
      content: r.content,
      timestamp: r.occurred_at,
      context: `${r.kind} memory for plant ${BANK_ID}`,
      tags: r.tags,
      document_id: r.id, // stable id → re-retain upserts (used by re-tag)
      update_mode: "replace",
      metadata: { local_id: r.id, asset: r.asset_id ?? "", outcome: r.outcome, kind: r.kind },
    })),
  });
}

/** Retain one or many memories (Hindsight + local mirror). Failures are logged as retain_failed. */
export async function retain(items: RetainInput | RetainInput[]) {
  const list = Array.isArray(items) ? items : [items];
  if (!list.length) return { ids: [] as string[], hindsight: false };
  const assets = await assetMap();
  const rows = list.map((m) => {
    const base = { asset_id: m.asset_id ?? null, outcome: m.outcome ?? "unknown", kind: m.kind ?? "incident" };
    return { ...base, content: m.content, tags: tagsFor(base, assets), occurred_at: m.occurred_at ?? new Date().toISOString() };
  });
  const { data, error } = await supabaseAdmin.from("memories").insert(rows).select("id");
  if (error) throw error;
  let ok = false;
  if (config()) {
    try {
      await pushToHindsight(rows.map((r, i) => ({ ...r, id: data![i]!.id })));
      ok = true;
    } catch (e) {
      await logEvent("retain_failed", `${rows.length} item(s): ${(e as Error).message}`);
    }
  }
  await logEvent("retain", `${rows.length} memories`);
  return { ids: data!.map((d) => d.id), hindsight: ok };
}

/** One-time backfill: add type:/line: tags to existing memories (local + Hindsight upsert by document_id). */
export async function retagAll() {
  const assets = await assetMap();
  const { data } = await supabaseAdmin.from("memories").select("*");
  const rows = (data ?? []).map((m) => ({ ...m, tags: tagsFor(m, assets) }));
  for (const r of rows) await supabaseAdmin.from("memories").update({ tags: r.tags }).eq("id", r.id);
  let failed = 0;
  if (config()) {
    for (let k = 0; k < rows.length; k += 10) {
      try {
        await pushToHindsight(rows.slice(k, k + 10));
      } catch (e) {
        failed += Math.min(10, rows.length - k);
        await logEvent("retain_failed", `re-tag: ${(e as Error).message}`);
      }
    }
  }
  return { retagged: rows.length, failed };
}

/* ---------------- Recall ---------------- */

const STOP = new Set("the a an and or of to in on at for with is was were it this that after from by be as".split(" "));
const tokens = (s: string) => s.toLowerCase().split(/[^a-z0-9-]+/).filter((w) => w.length > 2 && !STOP.has(w));

/** Keyword recall over the local mirror (fallback only). */
async function localRecall(query: string, opts: { asset?: string | null | undefined; tag?: string | undefined; limit?: number | undefined; allowIds?: Set<string> | undefined }) {
  const { data } = await supabaseAdmin.from("memories").select("*").order("created_at", { ascending: true });
  const qt = new Set(tokens(query));
  return (data ?? [])
    .filter((m) => (!opts.allowIds || opts.allowIds.has(m.id)) && (!opts.tag || m.tags.includes(opts.tag)) && (!opts.asset || m.asset_id === opts.asset))
    .map((m) => ({ ...m, score: tokens(m.content).filter((w) => qt.has(w)).length, source: "local" as const }) as Memory)
    .filter((m) => (m.score ?? 0) > 1)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, opts.limit ?? 8);
}

async function hindsightRecall(query: string, opts: { tags?: string[] | undefined; maxTokens?: number; budget?: "low" | "mid" | "high" }) {
  await ensureBank();
  const res = await hs("POST", "/memories/recall", {
    query,
    budget: opts.budget ?? "mid",
    max_tokens: opts.maxTokens ?? 3000,
    types: ["world", "experience"],
    ...(opts.tags?.length ? { tags: opts.tags, tags_match: "any" } : {}),
  });
  const results: any[] = res.results ?? [];
  const ids = [...new Set(results.map((r) => r.metadata?.local_id).filter(Boolean))] as string[];
  const { data: locals } = ids.length ? await supabaseAdmin.from("memories").select("*").in("id", ids) : { data: [] as any[] };
  const byId = new Map((locals ?? []).map((l) => [l.id, l]));
  return results.map((r) => {
    const l = byId.get(r.metadata?.local_id);
    return {
      id: r.id as string,
      local_id: (r.metadata?.local_id as string) ?? null,
      content: r.text as string,
      asset_id: l?.asset_id ?? r.metadata?.asset ?? null,
      outcome: l?.outcome ?? r.metadata?.outcome ?? "unknown",
      kind: l?.kind ?? r.metadata?.kind ?? "fact",
      occurred_at: l?.occurred_at ?? r.occurred_start ?? r.mentioned_at ?? new Date().toISOString(),
      source: "hindsight" as const,
    };
  });
}

/** Recall, optionally scoped by asset tag or by an arbitrary tag (e.g. type:tablet-press). */
export async function recall(query: string, opts: { asset?: string | null | undefined; tag?: string | undefined; limit?: number | undefined } = {}): Promise<RecallResult> {
  await logEvent("recall", query);
  const tags = opts.asset ? [`asset:${opts.asset}`] : opts.tag ? [opts.tag] : undefined;
  if (!config()) {
    return { memories: await localRecall(query, opts), source: "local", fallbackReason: "Hindsight not configured" };
  }
  try {
    const mems = await hindsightRecall(query, { tags });
    return { memories: mems.slice(0, opts.limit ?? 8), source: "hindsight", fallbackReason: null };
  } catch (e) {
    await logEvent("recall_fallback", (e as Error).message);
    return { memories: await localRecall(query, opts), source: "local", fallbackReason: `Hindsight unreachable: ${(e as Error).message}` };
  }
}

/** Memory Lab: Hindsight recall restricted to facts from the first N memories ever retained. */
export async function recallFirstN(query: string, upTo: number, limit = 6): Promise<RecallResult> {
  await logEvent("recall", `lab #${upTo}: ${query}`);
  const { data } = await supabaseAdmin.from("memories").select("id").order("created_at", { ascending: true }).limit(upTo);
  const allow = new Set((data ?? []).map((d) => d.id));
  if (!config()) return { memories: await localRecall(query, { allowIds: allow, limit }), source: "local", fallbackReason: "Hindsight not configured" };
  try {
    const mems = (await hindsightRecall(query, { maxTokens: 12000, budget: "high" })).filter((m) => m.local_id && allow.has(m.local_id));
    return { memories: mems.slice(0, limit), source: "hindsight", fallbackReason: null };
  } catch (e) {
    await logEvent("recall_fallback", (e as Error).message);
    return { memories: await localRecall(query, { allowIds: allow, limit }), source: "local", fallbackReason: `Hindsight unreachable: ${(e as Error).message}` };
  }
}

/* ---------------- Reflect, mental models, observations ---------------- */

export async function reflect(question: string, asset?: string | null): Promise<{ text: string; source: MemorySource; fallbackReason: string | null }> {
  await logEvent("reflect", question);
  let reason = "Hindsight not configured";
  if (config()) {
    try {
      await ensureBank();
      const res = await hs("POST", "/reflect", { query: question, budget: "mid", ...(asset ? { tags: [`asset:${asset}`], tags_match: "any" } : {}) }, 45000);
      if (res.text) return { text: res.text, source: "hindsight", fallbackReason: null };
      reason = "Hindsight returned no text";
    } catch (e) {
      reason = `Hindsight unreachable: ${(e as Error).message}`;
    }
  }
  const mems = await localRecall(`${question} ${asset ?? ""}`, { asset, limit: 12 });
  if (!mems.length) return { text: "No plant history yet for this question.", source: "local", fallbackReason: reason };
  const out = await chat({
    messages: [
      { role: "system", content: "You are a skeptical reliability engineer synthesizing plant memory. Max 6 sentences. Mention recurring patterns, fixes that held and failed, with dates." },
      { role: "user", content: `Question: ${question}\n\nMemories:\n${mems.map((m) => `- [${m.occurred_at.slice(0, 10)}] (${m.outcome}) ${m.content}`).join("\n")}` },
    ],
  });
  return { text: out.content, source: "local", fallbackReason: reason };
}

const mmId = (asset: string) => `asset-${asset}`;

/** Read (creating if needed) the per-asset mental model. Falls back to reflect. */
export async function assetKnowledge(asset: { id: string; name: string }) {
  if (config()) {
    try {
      await ensureBank();
      let mm: any = null;
      try {
        mm = await hs("GET", `/mental-models/${mmId(asset.id)}`);
      } catch (e) {
        if ((e as HindsightError).status !== 404) throw e;
        await hs("POST", "/mental-models", {
          id: mmId(asset.id),
          name: `${asset.name} reliability`,
          source_query: `What are the recurring failure modes, proven fixes and failed fixes for ${asset.name}?`,
          tags: [`asset:${asset.id}`],
          trigger: { refresh_after_consolidation: true },
        });
        return { text: null, kind: "mental_model" as const, pending: true, refreshedAt: null, source: "hindsight" as MemorySource, fallbackReason: null };
      }
      if (mm?.content) return { text: mm.content as string, kind: "mental_model" as const, pending: false, refreshedAt: mm.last_refreshed_at ?? null, source: "hindsight" as MemorySource, fallbackReason: null };
      return { text: null, kind: "mental_model" as const, pending: true, refreshedAt: null, source: "hindsight" as MemorySource, fallbackReason: null };
    } catch (e) {
      console.error("mental model unavailable, falling back to reflect", e);
    }
  }
  const r = await reflect(`What are the recurring failure modes, proven fixes and failed fixes for ${asset.name}?`, asset.id);
  return { text: r.text, kind: "reflect" as const, pending: false, refreshedAt: null, source: r.source, fallbackReason: r.fallbackReason };
}

export async function refreshAssetKnowledge(assetId: string) {
  if (!config()) return { ok: false };
  await hs("POST", `/mental-models/${mmId(assetId)}/refresh`, {});
  return { ok: true };
}

/** Hindsight observations (consolidated beliefs with proof counts) for an asset. */
export async function observations(assetId: string) {
  if (!config()) return { items: [] as { id: string; text: string; proof_count: number }[], available: false };
  try {
    const q = new URLSearchParams({ type: "observation", tags: `asset:${assetId}`, limit: "10" });
    const res = await hs("GET", `/memories/list?${q}`);
    return {
      items: (res.items ?? []).map((i: any) => ({ id: i.id, text: i.text, proof_count: i.proof_count ?? i.source_memory_ids?.length ?? 1 })),
      available: true,
    };
  } catch (e) {
    console.error("observations failed", e);
    return { items: [], available: false };
  }
}
