import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/foreman/AppShell";
import { listAssets } from "@/lib/foreman/api.functions";

const q = queryOptions({ queryKey: ["assets"], queryFn: () => listAssets() });

export const Route = createFileRoute("/assets/")({
  head: () => ({
    meta: [
      { title: "Assets — Foreman" },
      { name: "description", content: "Plant assets and their incident history." },
      { property: "og:title", content: "Assets — Foreman" },
      { property: "og:description", content: "Plant assets and their incident history." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(q),
  component: Assets,
});

function Assets() {
  const { data } = useSuspenseQuery(q);
  return (
    <div>
      <PageHeader title="Assets" subtitle="plant-hyd-01" />
      <div className="grid gap-4 p-6 sm:grid-cols-2 xl:grid-cols-4">
        {data.map((a: any) => {
          const open = a.incidents.filter((i: any) => i.status === "open").length;
          return (
            <Link key={a.id} to="/assets/$id" params={{ id: a.id }} className="rounded-lg border bg-card p-4 transition hover:border-memory">
              <div className="font-mono text-[10px] uppercase text-muted-foreground">{a.type} · {a.line}</div>
              <div className="mt-1 font-semibold">{a.name}</div>
              <div className="mt-3 flex gap-4 text-xs">
                <span><b className="font-mono">{a.incidents.length}</b> incidents</span>
                <span className={open ? "text-warning-foreground" : "text-muted-foreground"}><b className="font-mono">{open}</b> open</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
