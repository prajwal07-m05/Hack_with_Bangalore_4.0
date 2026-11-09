import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { BrainCircuit, CircleOff, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/foreman/AppShell";
import { OutcomeBadge } from "@/components/foreman/badges";
import { memoryCount, memoryLab } from "@/lib/foreman/api.functions";
import { cn } from "@/lib/utils";
import { FallbackBanner, SourceBadge } from "@/components/foreman/memory-status";

const q = queryOptions({ queryKey: ["memcount"], queryFn: () => memoryCount() });

export const Route = createFileRoute("/lab")({
  head: () => ({
    meta: [
      { title: "Memory Lab — Foreman" },
      { name: "description", content: "Side-by-side: Foreman with memory off vs on, as plant memory accumulates." },
      { property: "og:title", content: "Memory Lab — Foreman" },
      { property: "og:description", content: "Side-by-side: Foreman with memory off vs on, as plant memory accumulates." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(q),
  component: Lab,
});

const DEFAULT = "Tablet Press-2 turret vibration is at 6 mm/s and rising (VIB-207) right after we loaded a new lubricant lot. What's the root cause and what should we do?";

function Lab() {
  const { data: total } = useSuspenseQuery(q);
  const stops = [1, 5, 12, Math.max(total, 13)].filter((v, i, a) => a.indexOf(v) === i);
  const [stop, setStop] = useState(stops.length - 1);
  const [prompt, setPrompt] = useState(DEFAULT);
  const [res, setRes] = useState<{ off: string; on: string; memories: any[]; source: string; fallbackReason: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const upTo = stops[stop] ?? 1;

  async function run(i = stop) {
    setBusy(true);
    try { setRes(await memoryLab({ data: { prompt, upTo: stops[i] ?? 1 } })); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <PageHeader title="Memory Lab" subtitle="Same prompt, with and without plant memory." />
      <div className="space-y-5 p-6">
        {total === 0 && <div className="rounded bg-warning-soft p-3 text-sm text-warning-foreground">No memories retained yet — load plant history from the Dashboard first.</div>}
        <div className="rounded-lg border bg-card p-4">
          <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} />
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1">
              <span className="mr-2 text-xs font-semibold uppercase text-muted-foreground">Interaction</span>
              {stops.map((s, i) => (
                <button key={s} onClick={() => { setStop(i); if (res) run(i); }}
                  className={cn("flex items-center gap-1 rounded px-3 py-1.5 font-mono text-sm transition", i === stop ? "bg-memory text-memory-foreground" : "bg-muted hover:bg-memory-soft")}>
                  #{s}{i === stops.length - 1 && s === total ? " (all)" : ""}
                </button>
              ))}
              <span className="ml-2 text-xs text-muted-foreground">→ Foreman knows {Math.min(upTo, total)} memories</span>
            </div>
            <Button className="ml-auto" disabled={busy || prompt.length < 3} onClick={() => run()}>
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4" />} Run comparison
            </Button>
          </div>
        </div>

        {res?.fallbackReason && <FallbackBanner reason={res.fallbackReason} />}
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Memory OFF" icon={<CircleOff className="h-4 w-4" />} text={res?.off} busy={busy} />
          <Panel title={`Memory ON · interaction #${upTo}`} icon={<BrainCircuit className="h-4 w-4" />} text={res?.on} busy={busy} memory>
            {res && (
              <div className="mt-4 border-t pt-3">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-memory">Recalled ({res.memories.length}) <span className="font-normal normal-case text-muted-foreground">served by</span> <SourceBadge source={res.source} /></div>
                <div className="space-y-1.5">
                  {res.memories.length === 0 && <p className="text-xs text-muted-foreground">Nothing relevant in memory yet at this point.</p>}
                  {res.memories.map((m) => (
                    <div key={m.id} className="flex items-start gap-2 text-xs">
                      <SourceBadge source={m.source} /><OutcomeBadge outcome={m.outcome} />
                      <span className="line-clamp-2">{m.content}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, icon, text, busy, memory, children }: { title: string; icon: React.ReactNode; text?: string | undefined; busy: boolean; memory?: boolean; children?: React.ReactNode }) {
  return (
    <div className={cn("rounded-lg border bg-card p-5", memory && "memory-glow")}>
      <div className={cn("mb-3 flex items-center gap-2 text-sm font-semibold", memory ? "text-memory" : "text-muted-foreground")}>{icon}{title}</div>
      {busy ? <p className="text-sm text-muted-foreground pulse-dot">Thinking…</p> : <div className="whitespace-pre-wrap text-sm leading-relaxed">{text ?? "Run the comparison to see the answer."}</div>}
      {children}
    </div>
  );
}
