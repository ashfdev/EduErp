import { logger } from "../lib/logger";

// Fires the website's on-demand ISR revalidation webhook after a publish
// action. Best-effort: a failed revalidation just means the public page
// serves stale content until its normal ISR interval — never blocks the
// admin action that triggered it.
export async function triggerRevalidation(paths: string[]): Promise<void> {
  const websiteUrl = process.env.WEBSITE_URL;
  const secret = process.env.WEBSITE_REVALIDATE_SECRET;
  if (!websiteUrl || !secret) {
    logger.info({ paths }, "[revalidate stub] WEBSITE_URL/WEBSITE_REVALIDATE_SECRET not configured — skipping ISR revalidation");
    return;
  }

  for (const path of paths) {
    try {
      await fetch(`${websiteUrl}/api/revalidate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, path }),
      });
    } catch (err) {
      logger.warn({ path, err }, "Failed to trigger website ISR revalidation");
    }
  }
}
