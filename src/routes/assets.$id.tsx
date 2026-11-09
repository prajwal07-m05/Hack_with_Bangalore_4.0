import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { AlertTriangle, BrainCircuit, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/foreman/AppShell";
import { OutcomeBadge, SeverityBadge, StatusBadge, outcomeOf } from "@/components/foreman/badges";
import { assetKnowledge, getAsset, refreshAssetKnowledge } from "@/lib/foreman/api.functions";
import { SourceBadge } from "@/components/foreman/memory-status";
import { toast } from "sonner";

const q = (id: string) => queryOptions({ queryKey: ["asset", id], queryFn: () => getAsset({ data: { id } }) });

export const Route = createFileRoute("/assets/$id")({
  head: () => ({
    meta: [
      { title: "Asset history — Foreman" },
      { name: "description", content: "Incident timeline and what Foreman knows about this asset." },
      { property: "og:title", content: "Asset history — Foreman" },
      { property: "og:description", content: "Incident timeline and what Foreman knows about this asset." },
    ],
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(q(params.id)),
  component: AssetPage,
});

function AssetPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(q(id));
  // Mental model + observations load after the page renders (Hindsight calls).
  const reflection = useQuery({ queryKey: ["knowledge", id], queryFn: () => assetKnowledge({ data: { id } }), staleTime: 5 * 60_000, retry: 0 });
  const k = reflection.data?.knowledge;
  const obs = reflection.data?.observations;
  const a: any = data.asset;
  return (
    <div>
      <PageHeader title={a.name} subtitle={`${a.type} · ${a.line} · ${data.incidents.length} incidents`} />
      <div className="grid gap-6 p-6 lg:grid-cols-5">
        <section className="lg:col-span-3">
          <h2 className="mb-3 text-sm font-semibold">Timeline</h2>
          <ol className="relative space-y-4 border-l pl-6">
            {data.incidents.map((i: any) => {
              const o = i.outcomes?.[0];
              return (
                <li key={i.id} className="relative">
                  <span className={`absolute -left-[29px] top-1.5 h-3 w-3 rounded-full border-2 border-card ${o?.held === false ? "bg-destructive" : o?.held ? "bg-success" : "bg-muted-foreground"}`} />
                  <div className="rounded-lg border bg-card p-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono text-muted-foreground">{i.created_at.slice(0, 10)}</span>
                      <span className="font-mono">{i.fault_code}</span>
                      <SeverityBadge severity={i.severity} /><StatusBadge status={i.status} />
                    </div>
                    <Link to="/incidents/$id" params={{ id: i.id }} className="mt-1 block font-medium hover:text-memory">{i.title}</Link>
                    {o && (
                      <div className="mt-2 flex items-start gap-2 rounded bg-muted p-2 text-xs">
                        <OutcomeBadge outcome={outcomeOf(o.held)} />
                        <span><b>Fix:</b> {o.fix_summary}{o.followup_notes ? ` — ${o.followup_notes}` : ""}</span>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
        <aside className="space-y-4 lg:col-span-2">
          {data.alerts.map((al: any) => (
            <div key={al.id} className="flex gap-2 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm text-warning-foreground">
              <AlertTriangle className="h-4 w-4 shrink-0" /> {al.message}
            </div>
          ))}
          <div className="rounded-lg border bg-card p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-memory">
              <BrainCircuit className="h-4 w-4" /> What Foreman knows about this asset
              <Button variant="outline" size="sm" className="ml-auto h-7" disabled={reflection.isFetching} onClick={async () => {
                try { const r = await refreshAssetKnowledge({ data: { id } }); if (r.ok) toast.success("Mental model refresh queued in Hindsight"); } catch (e) { toast.error((e as Error).message); }
                reflection.refetch();
              }}>
                <RefreshCw className={`mr-1 h-3.5 w-3.5 ${reflection.isFetching ? "animate-spin" : ""}`} /> Refresh
              </Button>
            </div>
            {k && (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <SourceBadge source={k.source} /> {k.kind === "mental_model" ? "Mental model" : "Reflect (mental model unavailable)"}
                {k.refreshedAt && <span>· updated {new Date(k.refreshedAt).toLocaleDateString()}</span>}
              </div>
            )}
            {reflection.isFetching ? (
              <p className="mt-3 text-sm text-muted-foreground">Reading plant memory…</p>
            ) : reflection.error ? (
              <p className="mt-3 text-sm text-destructive">Unavailable right now. Try refresh.</p>
            ) : k?.pending ? (
              <p className="mt-3 text-sm text-muted-foreground">Hindsight is building the mental model for this asset. Check back shortly.</p>
            ) : (
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{k?.text}</p>
            )}
            {k?.fallbackReason && <p className="mt-2 text-xs text-warning-foreground">Using local fallback: {k.fallbackReason}</p>}
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="mb-1 text-sm font-semibold">What the plant has learned</div>
            <div className="mb-3 text-[11px] text-muted-foreground">Observations consolidated by Hindsight, with how many memories support each.</div>
            {!obs ? null : !obs.available ? (
              <p className="text-xs text-muted-foreground">Observations come from Hindsight and aren't available (not connected).</p>
            ) : obs.items.length === 0 ? (
              <p className="text-xs text-muted-foreground">No observations consolidated yet.</p>
            ) : (
              <ul className="space-y-2">
                {obs.items.map((o: { id: string; text: string; proof_count: number }) => (
                  <li key={o.id} className="flex gap-2 text-sm">
                    <span className="shrink-0 rounded bg-memory-soft px-1.5 py-0.5 font-mono text-[10px] text-accent-foreground">×{o.proof_count}</span>
                    <span>{o.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
