import { createFileRoute } from "@tanstack/react-router";

/**
 * POST { passcode } → sets the signed httpOnly gate cookie.
 * DELETE → clears it (sign out).
 * The passcode itself never leaves the server; the cookie holds only an HMAC.
 */
export const Route = createFileRoute("/api/public/gate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as { passcode?: string };
        const { passcodeMatches, signGate, gateConfigured, GATE_COOKIE } = await import("@/lib/foreman/gate.server");
        if (!gateConfigured()) {
          // No passcode configured → open demo, still set a cookie so the UI is consistent.
          return Response.json({ ok: true });
        }
        if (!body.passcode || !passcodeMatches(body.passcode)) {
          return Response.json({ ok: false, error: "Incorrect passcode" }, { status: 401 });
        }
        const cookie = `${GATE_COOKIE}=${signGate()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 86400}; Secure`;
        return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie } });
      },
      DELETE: async () => {
        const { GATE_COOKIE } = await import("@/lib/foreman/gate.server");
        return Response.json({ ok: true }, { headers: { "Set-Cookie": `${GATE_COOKIE}=; Path=/; HttpOnly; Max-Age=0` } });
      },
    },
  },
});
