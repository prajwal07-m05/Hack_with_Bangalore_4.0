import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertOctagon, BrainCircuit, CheckCircle2, Loader2, Send, Wrench, XCircle, Lightbulb, History, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { OutcomeBadge, SeverityBadge, StatusBadge } from "@/components/foreman/badges";
import { getIncident, postMessage, recordOutcome, resolveIncident, runAction } from "@/lib/foreman/api.functions";
import { cn } from "@/lib/utils";
import { FallbackBanner, SourceBadge, useIndexing } from "@/components/foreman/memory-status";

const incQuery = (id: string) => queryOptions({ queryKey: ["incident", id], queryFn: () => getIncident({ data: { id } }) });

export const Route = createFileRoute("/incidents/$id")({
  head: () => ({
    meta: [
      { title: "Incident thread — Foreman" },
      { name: "description", content: "Incident thread with Foreman's memory-backed analysis." },
      { property: "og:title", content: "Incident thread — Foreman" },
      { property: "og:description", content: "Incident thread with Foreman's memory-backed analysis." },
    ],
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(incQuery(params.id)),
  component: Thread,
});

type Step = { tool: string; status: string; detail?: string };
const TOOL_LABEL: Record<string, string> = {
  recall_memory: "Recalling memory",
  reflect_on_asset: "Reflecting on asset history",
  get_asset_history: "Reading asset history",
  create_capa: "Creating CAPA",
  create_work_order: "Creating work order",
  schedule_followup: "Scheduling follow-up",
  retain_memory: "Retaining memory",
  repair: "Repairing malformed answer",
  llm: "Reasoning",
};

function Thread() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(incQuery(id));
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [liveMems, setLiveMems] = useState<any[] | null>(null);
  const [selectedMsg, setSelectedMsg] = useState<string | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const indexing = useIndexing();
  const notReady = !!indexing.data && !indexing.data.ready;
  const bottom = useRef<HTMLDivElement>(null);
  const inc: any = data.incident;
  const refresh = () => qc.invalidateQueries({ queryKey: ["incident", id] });

  useEffect(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), [data.messages.length, steps.length]);

  const agentMsgs = data.messages.filter((m: any) => m.role === "agent" && m.memories_used);
  const panelMsg = selectedMsg ? data.messages.find((m: any) => m.id === selectedMsg) : agentMsgs[agentMsgs.length - 1];
  const panelMems: any[] = running && liveMems ? liveMems : ((panelMsg as any)?.memories_used ?? []);

  async function runAgent() {
    setRunning(true);
    setSteps([]);
    setLiveMems([]);
    setSelectedMsg(null);
    setFallback(null);
    try {
      const res = await fetch("/api/public/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ incidentId: id }) });
      if (!res.ok || !res.body) throw new Error(`Agent unavailable (${res.status})`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const l of lines) {
          if (!l.trim()) continue;
          const ev = JSON.parse(l);
          if (ev.type === "step") {
            setSteps((s) => {
              const i = s.findIndex((x) => x.tool === ev.tool && x.status === "running");
              if (i >= 0 && ev.status !== "running") { const c = [...s]; c[i] = { ...c[i]!, status: ev.status, detail: ev.detail ?? c[i]!.detail }; return c; }
              return [...s, ev];
            });
            if (ev.status === "error") toast.warning(`${TOOL_LABEL[ev.tool] ?? ev.tool} failed — continuing`, { description: ev.detail });
          } else if (ev.type === "memories") setLiveMems(ev.memories);
          else if (ev.type === "fallback") { setFallback(ev.reason); toast.warning(`Using local fallback: ${ev.reason}`); }
          else if (ev.type === "error") toast.error(`Foreman hit an error: ${ev.message}`);
        }
      }
    } catch (e) {
      toast.error((e as Error).message, { description: "The thread is still usable — try again." });
    } finally {
      await refresh();
      setRunning(false);
      setSteps([]);
      setLiveMems(null);
    }
  }

  async function send() {
    const content = text.trim();
    if (!content) return;
    setText("");
    try {
      const r = await postMessage({ data: { incidentId: id, content } });
      if (r.retained) toast.success(`Remembered: ${r.retained}`, { icon: <BrainCircuit className="h-4 w-4" /> });
      await refresh();
      if (r.triggerAgent) runAgent();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="flex h-[calc(100vh-0px)] flex-col">
      {/* Header */}
      <div className="border-b bg-card px-6 py-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Link to="/assets/$id" params={{ id: inc.asset_id }} className="font-medium text-foreground hover:text-memory">{inc.assets.name}</Link>
          <span>·</span><span>{inc.assets.line}</span><span>·</span><span className="font-mono">{inc.fault_code}</span>
          {inc.batch_no && <><span>·</span><span className="font-mono">batch {inc.batch_no}</span></>}
          <SeverityBadge severity={inc.severity} /><StatusBadge status={inc.status} />
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg font-semibold">{inc.title}</h1>
          {inc.status === "open" && <ResolveBox incidentId={id} onDone={refresh} />}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Thread */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-6">
            {data.messages.map((m: any) => (
              <MessageView key={m.id} m={m} incidentId={id} onRefresh={refresh} selected={panelMsg?.id === m.id} onSelect={() => setSelectedMsg(m.id)} />
            ))}
            {fallback && <FallbackBanner reason={fallback} />}
            {running && <StepIndicator steps={steps} />}
            <div ref={bottom} />
          </div>
          <div className="border-t bg-card p-4">
            <div className="flex gap-2">
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Message the thread… tag @Foreman to ask the agent"
                rows={2}
                className="resize-none"
              />
              <div className="flex flex-col gap-1">
                <Button onClick={send} disabled={running || notReady || !text.trim()}><Send className="h-4 w-4" /></Button>
                <Button variant="outline" size="sm" disabled={running} onClick={() => setText((t) => (t.includes("@Foreman") ? t : `@Foreman ${t}`))} className="text-memory">@</Button>
              </div>
            </div>
            {notReady && <p className="mt-2 text-xs text-accent-foreground">Hindsight is still indexing plant history — Foreman will be available in a moment.</p>}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {["@Foreman what's the likely root cause?", "@Foreman have we seen this before?", "That's wrong, it was the seal"].map((s) => (
                <button key={s} onClick={() => setText(s)} className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground hover:border-memory hover:text-memory">{s}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Memory Used panel */}
        <aside className="hidden w-80 shrink-0 flex-col border-l bg-card lg:flex xl:w-96">
          <div className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold text-memory">
            <BrainCircuit className="h-4 w-4" /> Memory Used
            {running && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span className="ml-auto font-mono text-xs text-muted-foreground">{panelMems.length}</span>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {panelMems.length === 0 ? (
              <div className="rounded border border-dashed p-4 text-center text-xs text-muted-foreground">
                {agentMsgs.length === 0 && !running ? "Tag @Foreman to see which memories it recalls." : "No memories recalled — no plant history for this yet."}
              </div>
            ) : (
              [...panelMems].sort((a, b) => Number(!!b.influenced) - Number(!!a.influenced)).map((mm) => (
                <div key={mm.id} className={cn("rounded border p-2.5 text-xs", mm.influenced ? "border-memory bg-memory-soft" : "bg-background")}>
                  <div className="mb-1 flex items-center gap-1.5">
                    <span className="font-mono text-[10px] text-muted-foreground">{mm.occurred_at?.slice(0, 10)}</span>
                    {mm.asset_id && <span className="font-mono text-[10px] text-muted-foreground">· {mm.asset_id}</span>}
                    <span className="ml-auto flex items-center gap-1"><SourceBadge source={mm.source} /><OutcomeBadge outcome={mm.outcome} /></span>
                  </div>
                  {mm.sibling && <div className="mb-1 inline-block rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">Sibling asset: {mm.sibling}</div>}
                  <p className="line-clamp-4 leading-relaxed">{mm.content}</p>
                  {mm.influenced && <div className="mt-1 text-[10px] font-semibold uppercase text-memory">Influenced answer</div>}
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function StepIndicator({ steps }: { steps: Step[] }) {
  return (
    <div className="max-w-2xl rounded-lg border border-memory/40 bg-memory-soft p-3 text-sm">
      <div className="mb-2 flex items-center gap-2 font-medium text-accent-foreground">
        <BrainCircuit className="h-4 w-4 pulse-dot" /> Foreman is {steps.length ? "working" : "recalling memory"}…
      </div>
      <ol className="space-y-1 font-mono text-xs">
        {steps.map((s, i) => (
          <li key={i} className="flex items-center gap-2">
            {s.status === "running" ? <Loader2 className="h-3 w-3 animate-spin text-memory" /> : s.status === "done" ? <Check className="h-3 w-3 text-success" /> : <XCircle className="h-3 w-3 text-destructive" />}
            <span>{TOOL_LABEL[s.tool] ?? s.tool}</span>
            {s.detail && <span className="truncate text-muted-foreground">— {s.detail}</span>}
          </li>
        ))}
        <li className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> reasoning…</li>
      </ol>
    </div>
  );
}

function MessageView({ m, incidentId, onRefresh, selected, onSelect }: { m: any; incidentId: string; onRefresh: () => void; selected: boolean; onSelect: () => void }) {
  const time = new Date(m.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  if (m.role === "system") return <div className="text-center font-mono text-[11px] text-muted-foreground">{m.content} · {time}</div>;
  if (m.role === "operator")
    return (
      <div className="flex justify-end">
        <div className="max-w-xl rounded-lg bg-primary px-4 py-2.5 text-sm text-primary-foreground">
          <Highlight text={m.content} />
          <div className="mt-1 text-right font-mono text-[10px] opacity-60">{time}</div>
        </div>
      </div>
    );
  // agent
  if (m.card?.kind === "followup") return <FollowupCard m={m} incidentId={incidentId} onRefresh={onRefresh} />;
  const c = m.card;
  return (
    <div className="max-w-3xl cursor-pointer" onClick={onSelect}>
      <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-memory">
        <BrainCircuit className="h-3.5 w-3.5" /> Foreman <span className="font-mono font-normal text-muted-foreground">{time}</span>
        {(m.tool_calls ?? []).length > 0 && <span className="font-mono font-normal text-muted-foreground">· {m.tool_calls.map((t: any) => t.tool).join(" → ")}</span>}
      </div>
      <div className={cn("space-y-3 rounded-lg border bg-card p-4", selected && "memory-glow")}>
        {c?.memory_empty && <div className="rounded bg-warning-soft px-3 py-1.5 text-xs font-medium text-warning-foreground">No plant history yet — generic guidance below.</div>}
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</p>
        {c?.do_not_repeat?.length > 0 && (
          <Card icon={<AlertOctagon className="h-4 w-4" />} title="Do NOT repeat" tone="danger">
            {c.do_not_repeat.map((d: any, i: number) => (
              <li key={i}><b>{d.fix}</b> — {d.reason}</li>
            ))}
          </Card>
        )}
        {c?.similar?.length > 0 && (
          <Card icon={<History className="h-4 w-4" />} title="Similar past incidents" tone="memory">
            {c.similar.map((s: any, i: number) => (
              <li key={i} className="flex items-start gap-2"><span className="font-mono text-[11px] text-muted-foreground">{s.date}</span><span className="flex-1">{s.title}</span><OutcomeBadge outcome={s.outcome} /></li>
            ))}
          </Card>
        )}
        {c?.hypothesis && (
          <Card icon={<Lightbulb className="h-4 w-4" />} title={`Root-cause hypothesis · ${Math.round((c.hypothesis.confidence ?? 0) * (c.hypothesis.confidence > 1 ? 1 : 100))}% confidence`}>
            <li>{c.hypothesis.text}</li>
            <div className="mt-2 h-1.5 overflow-hidden rounded bg-muted"><div className="h-full bg-memory" style={{ width: `${Math.min(100, (c.hypothesis.confidence ?? 0) * (c.hypothesis.confidence > 1 ? 1 : 100))}%` }} /></div>
            {c.hypothesis.cited_memory_ids?.length > 0 && <div className="mt-1 text-[11px] text-memory">Cites {c.hypothesis.cited_memory_ids.length} memor{c.hypothesis.cited_memory_ids.length === 1 ? "y" : "ies"} (see panel →)</div>}
          </Card>
        )}
        {c?.actions?.length > 0 && (
          <Card icon={<Wrench className="h-4 w-4" />} title="Recommended actions">
            {c.actions.map((a: any, i: number) => <ActionRow key={i} a={a} incidentId={incidentId} onRefresh={onRefresh} />)}
          </Card>
        )}
        {c?.followup_question && <p className="text-xs italic text-muted-foreground">{c.followup_question}</p>}
      </div>
    </div>
  );
}

function Card({ icon, title, children, tone }: { icon: React.ReactNode; title: string; children: React.ReactNode; tone?: "danger" | "memory" }) {
  return (
    <div className={cn("rounded border p-3", tone === "danger" ? "border-destructive/40 bg-destructive/5" : tone === "memory" ? "border-memory/30 bg-memory-soft/50" : "bg-background")}>
      <div className={cn("mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide", tone === "danger" ? "text-destructive" : tone === "memory" ? "text-memory" : "text-foreground")}>{icon}{title}</div>
      <ul className="space-y-1.5 text-sm">{children}</ul>
    </div>
  );
}

function ActionRow({ a, incidentId, onRefresh }: { a: any; incidentId: string; onRefresh: () => void }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const label = { capa: "Create CAPA", work_order: "Create work order", followup: "Schedule follow-up" }[a.type as string] ?? "Run";
  return (
    <li className="flex items-center gap-2">
      <span className="flex-1">{a.label}</span>
      <Button size="sm" variant={state === "done" ? "outline" : "default"} disabled={state !== "idle"} onClick={async (e) => {
        e.stopPropagation();
        setState("busy");
        try { const r = await runAction({ data: { incidentId, type: a.type, args: a.args ?? {} } }); toast.success(r.summary); setState("done"); onRefresh(); }
        catch (err) { toast.error((err as Error).message); setState("idle"); }
      }}>
        {state === "busy" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : state === "done" ? <><Check className="mr-1 h-3.5 w-3.5" />Done</> : label}
      </Button>
    </li>
  );
}

function FollowupCard({ m, incidentId, onRefresh }: { m: any; incidentId: string; onRefresh: () => void }) {
  const [notes, setNotes] = useState("");
  const [done, setDone] = useState(false);
  async function answer(held: boolean) {
    await recordOutcome({ data: { incidentId, held, notes: notes || undefined } });
    toast.success("Outcome retained in memory");
    setDone(true);
    onRefresh();
  }
  return (
    <div className="max-w-xl rounded-lg border border-memory/50 bg-memory-soft p-4 text-sm">
      <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-memory"><BrainCircuit className="h-3.5 w-3.5" /> Foreman follow-up</div>
      <p>{m.content}</p>
      {!done && (
        <div className="mt-3 space-y-2">
          <Input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => answer(true)}><CheckCircle2 className="mr-1 h-4 w-4" />Fix held</Button>
            <Button size="sm" variant="destructive" onClick={() => answer(false)}><XCircle className="mr-1 h-4 w-4" />Fix failed</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ResolveBox({ incidentId, onDone }: { incidentId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [fix, setFix] = useState("");
  if (!open) return <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Resolve…</Button>;
  return (
    <form className="flex gap-2" onSubmit={async (e) => {
      e.preventDefault();
      if (fix.trim().length < 3) return;
      await resolveIncident({ data: { incidentId, fix } });
      toast.success("Resolved — fix retained, follow-up scheduled in 3 days");
      setOpen(false);
      onDone();
    }}>
      <Input autoFocus value={fix} onChange={(e) => setFix(e.target.value)} placeholder="What fix was applied?" className="w-72" />
      <Button size="sm" type="submit">Save</Button>
    </form>
  );
}

function Highlight({ text }: { text: string }) {
  const parts = text.split(/(@Foreman)/gi);
  return <span className="whitespace-pre-wrap">{parts.map((p, i) => (/^@foreman$/i.test(p) ? <b key={i} className="text-sidebar-primary">{p}</b> : p))}</span>;
}
