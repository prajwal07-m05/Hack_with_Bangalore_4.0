import { cn } from "@/lib/utils";

export function OutcomeBadge({ outcome }: { outcome?: string | null }) {
  const o = (outcome ?? "unknown").toLowerCase();
  const map: Record<string, string> = {
    held: "bg-success-soft text-success border-success/30",
    failed: "bg-destructive/10 text-destructive border-destructive/30",
    unknown: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={cn("inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase", map[o] ?? map["unknown"])}>
      {o === "held" ? "Held" : o === "failed" ? "Failed" : "Unknown"}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    low: "bg-muted text-muted-foreground",
    medium: "bg-warning-soft text-warning-foreground",
    high: "bg-warning text-warning-foreground",
    critical: "bg-destructive text-destructive-foreground",
  };
  return <span className={cn("rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase", map[severity] ?? map["low"])}>{severity}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("rounded px-1.5 py-0.5 font-mono text-[10px] uppercase", status === "open" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground")}>
      {status}
    </span>
  );
}

export const outcomeOf = (held: boolean | null | undefined) => (held === true ? "held" : held === false ? "failed" : "unknown");
