import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { BrainCircuit, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Foreman" },
      { name: "description", content: "Demo passcode sign-in for the Foreman plant-operations demo." },
      { property: "og:title", content: "Sign in — Foreman" },
      { property: "og:description", content: "Demo passcode sign-in for the Foreman plant-operations demo." },
    ],
  }),
  component: Login,
});

function Login() {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(false);
    try {
      const res = await fetch("/api/public/gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      if (!res.ok) {
        setError(true);
        return;
      }
      await router.invalidate();
      await router.navigate({ to: "/" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-lg border bg-card p-6">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-memory">
          <BrainCircuit className="h-4 w-4" /> FOREMAN
        </div>
        <h1 className="text-lg font-semibold">Demo sign-in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This demo spends AI and memory credits, so it's behind a passcode. Enter the demo passcode to continue.
        </p>
        <div className="mt-4 space-y-3">
          <Input
            type="password"
            autoFocus
            autoComplete="current-password"
            placeholder="Demo passcode"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
          />
          {error && <p className="text-sm text-destructive">Incorrect passcode.</p>}
          <Button className="w-full" disabled={busy || !passcode}>
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Lock className="mr-1.5 h-4 w-4" />}
            Enter
          </Button>
        </div>
      </form>
    </div>
  );
}
