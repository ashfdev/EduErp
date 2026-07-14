import { createNavigation } from "next-intl/navigation";
import { defineRouting } from "next-intl/routing";

// Bangla first — this institution's primary audience is Bangla-speaking
// parents/students, matching User.lang_pref's own @default(BN) on the
// authenticated side of the system.
export const routing = defineRouting({
  locales: ["bn", "en"],
  defaultLocale: "bn",
});

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
