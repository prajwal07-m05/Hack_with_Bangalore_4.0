import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, BrainCircuit, Database, Radar, BellRing, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/foreman/AppShell";
import { SeverityBadge } from "@/components/foreman/badges";
import { checkFollowups, dismissAlert, getDashboard, loadPlantHistory, retagMemories, runProactiveScan } from "@/lib/foreman/api.functions";

const dashQuery = queryOptions({ queryKey: ["dashboard"], queryFn: () => getDashboard() });

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Foreman" },
      { name: "description", content: "Open incidents, assets at risk and plant memory stats." },
      { property: "og:title", content: "Foreman Dashboard" },
      { property: "og:description", content: "Open incidents, assets at risk and plant memory stats." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(dashQuery),
  component: Dashboard,
});

function Dashboard() {
  const { data } = useSuspenseQuery(dashQuery);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["hs-indexing"] });
  };

  async function run(label: string, fn: () => Promise<any>, ok: (r: any) => string) {
    setBusy(label);
    try {
      toast.success(ok(await fn()));
      refresh();
    } catch (e) {
      toast.error(`${label} failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  const s = data.stats;
  return (
    <div>
      <PageHeader
        title="Plant Dashboard"
        subtitle="plant-hyd-01"
        actions={
          <>
            <Button variant="outline" size="sm" disabled={!!busy} onClick={() => run("Load plant history", () => loadPlantHistory(), (r) => (r.skipped ? "Plant history already loaded" : `Retained ${r.retained} memories`))}>
              <Database className="mr-1.5 h-4 w-4" /> {busy === "Load plant history" ? "Retaining…" : "Load plant history"}
            </Button>
            <Button variant="outline" size="sm" disabled={!!busy} onClick={() => run("Re-tag memories", () => retagMemories(), (r) => `Re-tagged ${r.retagged} memories${r.failed ? ` (${r.failed} failed)` : ""}`)}>
              Re-tag memories
            </Button>
            <Button variant="outline" size="sm" disabled={!!busy} onClick={() => run("Follow-ups", () => checkFollowups(), (r) => `${r.posted} follow-up(s) posted`)}>
              <BellRing className="mr-1.5 h-4 w-4" /> Check follow-ups{data.dueFollowups ? ` (${data.dueFollowups})` : ""}
            </Button>
            <Button size="sm" disabled={!!busy} onClick={() => run("Proactive scan", () => runProactiveScan(), (r) => `${r.alerts} risk alert(s) raised`)}>
              <Radar className="mr-1.5 h-4 w-4" /> {busy === "Proactive scan" ? "Scanning…" : "Run proactive scan"}
            </Button>
          </>
        }
      />
      <div className="grid gap-4 p-6 lg:grid-cols-3">
        {/* Memory stats */}
        <section className="rounded-lg border bg-card p-5 memory-glow lg:col-span-1">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-memory">
            <BrainCircuit className="h-4 w-4" /> Memory Stats
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Memories retained" value={s.memories} />
            <Stat label="Recalls this week" value={s.recallsWeek} />
            <Stat label="Fixes that held" value={s.held} tone="success" />
            <Stat label="Fixes that failed" value={s.failed} tone="destructive" />
            <Stat label="Retain failures" value={s.retainFailed} tone={s.retainFailed ? "destructive" : undefined} />
          </div>
          {s.memories === 0 && (
            <p className="mt-4 rounded bg-memory-soft p-3 text-xs text-accent-foreground">
              No memories yet. Click <b>Load plant history</b> to retain the plant's past incidents into Hindsight.
            </p>
          )}
        </section>

        {/* Risk alerts */}
        <section className="rounded-lg border bg-card p-5 lg:col-span-2">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4 text-warning" /> Assets at risk
          </div>
          {data.alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No risk alerts. Run a proactive scan to check recent incidents against plant memory.</p>
          ) : (
            <ul className="space-y-2">
              {data.alerts.map((a: any) => (
                <li key={a.id} className="flex items-start gap-3 rounded border border-warning/40 bg-warning-soft p-3 text-sm">
                  <SeverityBadge severity={a.severity} />
                  <Link to="/assets/$id" params={{ id: a.asset_id }} className="flex-1 text-warning-foreground hover:underline">
                    {a.message}
                  </Link>
                  <button aria-label="Dismiss" onClick={async () => { await dismissAlert({ data: { id: a.id } }); refresh(); }} className="text-warning-foreground/60 hover:text-warning-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Open incidents */}
        <section className="rounded-lg border bg-card p-5 lg:col-span-1">
          <div className="mb-3 text-sm font-semibold">Open incidents ({data.open.length})</div>
          <ul className="divide-y">
            {data.open.map((i: any) => (
              <li key={i.id}>
                <Link to="/incidents/$id" params={{ id: i.id }} className="flex items-center gap-2 py-2.5 text-sm hover:text-memory">
                  <SeverityBadge severity={i.severity} />
                  <span className="flex-1 truncate">{i.title}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{i.assets?.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* Trend */}
        <section className="rounded-lg border bg-card p-5 lg:col-span-2">
          <div className="mb-3 text-sm font-semibold">Recurring-failure trend (top fault codes / month)</div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.trend.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {data.trend.codes.map((c, i) => (
                  <Bar key={c} dataKey={c} stackId="a" fill={`var(--chart-${i + 1})`} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "success" | "destructive" | undefined }) {
  return (
    <div>
      <div className={`font-mono text-2xl font-semibold ${tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "text-foreground"}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
