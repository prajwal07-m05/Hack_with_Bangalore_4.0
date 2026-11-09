import { Link } from "@tanstack/react-router";
import { Activity, Boxes, BrainCircuit, ClipboardList, FlaskConical, LayoutDashboard } from "lucide-react";
import type { ReactNode } from "react";
import { HindsightStatus, IndexingBanner } from "./memory-status";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/incidents", label: "Incidents", icon: Activity },
  { to: "/assets", label: "Assets", icon: Boxes },
  { to: "/handover", label: "Shift Handover", icon: ClipboardList },
  { to: "/lab", label: "Memory Lab", icon: FlaskConical },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex items-center gap-2 border-b border-sidebar-border px-5 py-5">
          <div className="grid h-8 w-8 place-items-center rounded bg-sidebar-primary text-sidebar-primary-foreground">
            <BrainCircuit className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-wide text-sidebar-accent-foreground">FOREMAN</div>
            <div className="font-mono text-[10px] uppercase text-sidebar-foreground/60">plant-hyd-01</div>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-3">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: n.to === "/" }}
              className="flex items-center gap-3 rounded px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
            >
              <n.icon className="h-4 w-4" />
              {n.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <nav className="flex gap-1 overflow-x-auto bg-sidebar p-2 md:hidden">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className="whitespace-nowrap rounded px-3 py-1.5 text-xs text-sidebar-foreground"
              activeOptions={{ exact: n.to === "/" }} activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center justify-end border-b bg-card px-6 py-2">
          <HindsightStatus />
        </div>
        <IndexingBanner />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b bg-card px-6 py-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
