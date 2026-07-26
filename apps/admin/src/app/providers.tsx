"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { I18nProvider } from "@/components/i18n-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  // refetchOnWindowFocus disabled app-wide (Plan Fifteen, Phase E) — the
  // TanStack Query default of `true` means switching tabs/apps mid-edit on
  // any data-entry form silently triggers a background refetch; standard
  // practice for admin/data-entry panels to avoid that class of surprising
  // background staleness while a form is in progress.
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }));

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        {children}
        <Toaster richColors position="top-right" />
      </I18nProvider>
    </QueryClientProvider>
  );
}
