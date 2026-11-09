import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Cron target: post due "did the fix hold?" follow-ups every hour. */
export const Route = createFileRoute("/api/public/cron/check-followups")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { runCheckFollowups } = await import("@/lib/foreman/jobs.server");
        const result = await runCheckFollowups();
        return Response.json({ success: true, ...result });
      },
    },
  },
});
