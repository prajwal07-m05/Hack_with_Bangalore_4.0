import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ClipboardList, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/foreman/AppShell";
import { OutcomeBadge, SeverityBadge } from "@/components/foreman/badges";
import { generateHandover, latestHandover } from "@/lib/foreman/api.functions";

const q = queryOptions({ queryKey: ["handover"], queryFn: () => latestHandover() });

export const Route = createFileRoute("/handover")({
  head: () => ({
    meta: [
      { title: "Shift Handover — Foreman" },
      { name: "description", content: "Memory-backed risk brief for the next shift." },
      { property: "og:title", content: "Shift Handover — Foreman" },
      { property: "og:description", content: "Memory-backed risk brief for the next shift." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(q),
  component: Handover,
});

function Handover() {
  const { data } = useSuspenseQuery(q);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const b: any = data?.brief;
  return (
    <div>
      <PageHeader
        title="Shift Handover"
        subtitle={data ? `Last brief ${new Date(data.created_at).toLocaleString()}` : "No brief generated yet"}
        actions={
          <Button disabled={busy} onClick={async () => {
            setBusy(true);
            try { const r = await generateHandover(); qc.setQueryData(q.queryKey, r as any); }
            catch (e) { toast.error((e as Error).message); }
            finally { setBusy(false); }
          }}>
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ClipboardList className="mr-1.5 h-4 w-4" />} Generate handover brief
          </Button>
        }
      />
      <div className="grid gap-6 p-6 lg:grid-cols-3">
        {!b ? (
          <p className="text-sm text-muted-foreground">Generate a brief to see risks for the next shift based on recent incidents and recalled patterns.</p>
        ) : (
          <>
            <div className="space-y-3 lg:col-span-2">
              <h2 className="text-lg font-semibold">{b.headline}</h2>
              {(b.risks ?? []).map((r: any, i: number) => (
                <div key={i} className="rounded-lg border bg-card p-4">
                  <div className="flex items-center gap-2"><SeverityBadge severity={r.severity} /><b>{r.asset}</b><span className="text-muted-foreground">— {r.risk}</span></div>
                  <p className="mt-2 text-sm"><span className="text-xs font-semibold uppercase text-memory">Why: </span>{r.why}</p>
                  <p className="mt-1 text-sm"><span className="text-xs font-semibold uppercase">Action: </span>{r.action}</p>
                </div>
              ))}
              {b.watch_items?.length > 0 && (
                <div className="rounded-lg border border-warning/40 bg-warning-soft p-4 text-sm text-warning-foreground">
                  <b>Watch items</b>
                  <ul className="mt-1 list-disc pl-5">{b.watch_items.map((w: string, i: number) => <li key={i}>{w}</li>)}</ul>
                </div>
              )}
            </div>
            <aside className="rounded-lg border bg-card p-4">
              <div className="mb-2 text-sm font-semibold text-memory">Memories recalled ({b.memories?.length ?? 0})</div>
              <div className="space-y-2">
                {(b.memories ?? []).map((m: any) => (
                  <div key={m.id} className="rounded border p-2 text-xs">
                    <div className="mb-1 flex justify-between"><span className="font-mono text-muted-foreground">{m.occurred_at?.slice(0, 10)}</span><OutcomeBadge outcome={m.outcome} /></div>
                    <p className="line-clamp-3">{m.content}</p>
                  </div>
                ))}
              </div>
            </aside>
          </>
        )}
      </div>
    </div>
  );
}
