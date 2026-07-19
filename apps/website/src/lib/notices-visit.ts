// Shared by the navbar's "new since last visit" badge and the Notices page
// itself — the badge must clear no matter how a visitor reaches /notices
// (nav dropdown click, direct URL, browser back/forward), not only via the
// one nav-link click handler.
export const NOTICES_LAST_VISIT_KEY = "eduerp-notices-last-visit";

export function markNoticesVisited(): void {
  localStorage.setItem(NOTICES_LAST_VISIT_KEY, new Date().toISOString());
}
