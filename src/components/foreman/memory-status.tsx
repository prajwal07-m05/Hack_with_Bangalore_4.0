import { useQuery } from "@tanstack/react-query";
import { Loader2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { healthCheck, indexingStatus } from "@/lib/foreman/api.functions";

/** Small badge naming which backend served a memory. */
export function SourceBadge({ source }: { source?: string | null }) {
  const hs = source === "hindsight";
  return (
    <span className={cn("rounded px-1 py-0.5 font-mono text-[9px] uppercase", hs ? "bg-memory-soft text-accent-foreground" : "bg-warning-soft text-warning-foreground")}>
      {hs ? "Hindsight" : "Local fallback"}
    </span>
  );
}

/** Global header badge: Hindsight Connected / Fallback / Not configured (server caches 30s). */
export function HindsightStatus() {
  const { data } = useQuery({ queryKey: ["hs-health"], queryFn: () => healthCheck(), refetchInterval: 30_000, staleTime: 25_000 });
  const status = data?.status;
  const label = status === "connected" ? "Connected" : status === "fallback" ? "Fallback" : status === "not_configured" ? "Not configured" : "Checking…";
  return (
    <span
      title={data?.detail ?? undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
        status === "connected" ? "border-memory/40 text-accent-foreground" : "border-warning/50 bg-warning-soft text-warning-foreground",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", status === "connected" ? "bg-memory" : "bg-warning")} />
      Hindsight: {label}
    </span>
  );
}

/** Polls Hindsight until async retains are searchable. */
export function useIndexing() {
  return useQuery({
    queryKey: ["hs-indexing"],
    queryFn: () => indexingStatus(),
    refetchInterval: (q) => (q.state.data && !q.state.data.ready ? 3000 : false),
  });
}

export function IndexingBanner() {
  const { data } = useIndexing();
  if (!data || data.ready) return null;
  return (
    <div className="flex items-center gap-2 border-b border-memory/30 bg-memory-soft px-6 py-2 text-sm text-accent-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Hindsight is indexing {data.local} memories… Foreman will be ready when this finishes.
    </div>
  );
}

export function FallbackBanner({ reason }: { reason: string }) {
  return (
    <div className="flex items-center gap-2 rounded border border-warning/50 bg-warning-soft px-3 py-2 text-sm text-warning-foreground">
      <TriangleAlert className="h-4 w-4 shrink-0" /> Using local fallback: {reason}
    </div>
  );
}
