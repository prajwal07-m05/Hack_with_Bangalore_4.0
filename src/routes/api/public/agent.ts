import { createFileRoute } from "@tanstack/react-router";

/**
 * POST { incidentId } → NDJSON stream of agent events (tool steps, recalled memories, done).
 * Streams so the UI can show "Foreman is recalling memory…" and every tool call live.
 */
export const Route = createFileRoute("/api/public/agent")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as { incidentId?: string };
        if (!body.incidentId || !/^[0-9a-f-]{36}$/i.test(body.incidentId)) {
          return Response.json({ error: "incidentId required" }, { status: 400 });
        }
        const { runAgent } = await import("@/lib/foreman/agent.server");
        const enc = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            const emit = (e: unknown) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
            try {
              await runAgent(body.incidentId!, emit);
            } catch (e) {
              emit({ type: "error", message: e instanceof Error ? e.message : String(e) });
            } finally {
              controller.close();
            }
          },
        });
        return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" } });
      },
    },
  },
});
