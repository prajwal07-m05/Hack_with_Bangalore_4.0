import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/foreman/AppShell";
import { SeverityBadge, StatusBadge } from "@/components/foreman/badges";
import { createIncident, listIncidents } from "@/lib/foreman/api.functions";

const q = queryOptions({ queryKey: ["incidents"], queryFn: () => listIncidents() });

export const Route = createFileRoute("/incidents/")({
  head: () => ({
    meta: [
      { title: "Incidents — Foreman" },
      { name: "description", content: "All plant incidents and their threads." },
      { property: "og:title", content: "Incidents — Foreman" },
      { property: "og:description", content: "All plant incidents and their threads." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(q),
  component: Incidents,
});

function Incidents() {
  const { data } = useSuspenseQuery(q);
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("all");
  const list = data.incidents.filter((i: any) => filter === "all" || i.status === filter);
  return (
    <div>
      <PageHeader title="Incidents" subtitle={`${data.incidents.length} incidents across ${data.assets.length} assets`} actions={<NewIncident assets={data.assets} />} />
      <div className="p-6">
        <div className="mb-3 flex gap-1">
          {(["all", "open", "resolved"] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)} className="capitalize">{f}</Button>
          ))}
        </div>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr><th className="px-4 py-2">Date</th><th className="px-4 py-2">Incident</th><th className="px-4 py-2">Asset</th><th className="px-4 py-2">Fault</th><th className="px-4 py-2">Severity</th><th className="px-4 py-2">Status</th></tr>
            </thead>
            <tbody className="divide-y">
              {list.map((i: any) => (
                <tr key={i.id} className="hover:bg-muted/50">
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{i.created_at.slice(0, 10)}</td>
                  <td className="px-4 py-2"><Link to="/incidents/$id" params={{ id: i.id }} className="font-medium hover:text-memory">{i.title}</Link></td>
                  <td className="px-4 py-2 text-muted-foreground">{i.assets?.name}</td>
                  <td className="px-4 py-2 font-mono text-xs">{i.fault_code}</td>
                  <td className="px-4 py-2"><SeverityBadge severity={i.severity} /></td>
                  <td className="px-4 py-2"><StatusBadge status={i.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function NewIncident({ assets }: { assets: any[] }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const r = await createIncident({
        data: {
          asset_id: String(f.get("asset_id")), title: String(f.get("title")), description: String(f.get("description")),
          severity: String(f.get("severity")) as any, fault_code: String(f.get("fault_code") || "") || undefined,
          batch_no: String(f.get("batch_no") || "") || undefined, technician: String(f.get("technician") || "") || undefined,
        },
      });
      setOpen(false);
      nav({ to: "/incidents/$id", params: { id: r.id } });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const sel = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus className="mr-1 h-4 w-4" /> New incident</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Report incident</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Asset</Label><select name="asset_id" className={sel}>{assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
            <div><Label>Severity</Label><select name="severity" defaultValue="medium" className={sel}>{["low", "medium", "high", "critical"].map((s) => <option key={s}>{s}</option>)}</select></div>
          </div>
          <div><Label>Title</Label><Input name="title" required minLength={3} /></div>
          <div><Label>Description</Label><Textarea name="description" required rows={3} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Fault code</Label><Input name="fault_code" placeholder="VIB-207" /></div>
            <div><Label>Batch</Label><Input name="batch_no" /></div>
            <div><Label>Technician</Label><Input name="technician" /></div>
          </div>
          <Button type="submit" disabled={busy} className="w-full">{busy ? "Creating…" : "Create & open thread"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
