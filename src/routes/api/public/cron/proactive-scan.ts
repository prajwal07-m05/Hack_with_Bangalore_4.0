import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Cron target: proactive scan every 6 hours. */
export const Route = createFileRoute("/api/public/cron/proactive-scan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { runScan } = await import("@/lib/foreman/jobs.server");
        const result = await runScan();
        return Response.json({ success: true, ...result });
      },
    },
  },
});
