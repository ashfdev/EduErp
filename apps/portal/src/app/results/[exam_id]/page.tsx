"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// The old per-exam detail route is now folded into the unified search-first
// /results page (Select Session + Select Exam + Search, matching the
// reference "Academic Result" UI) — nothing in this codebase deep-links here
// anymore, but redirect rather than 404 in case anything old is bookmarked.
export default function ResultDetailRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/results");
  }, [router]);
  return null;
}
