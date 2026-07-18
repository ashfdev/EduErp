"use client";

import { useEffect, useState } from "react";
import { fetchContent } from "@/lib/content-api";
import type { Institution } from "@/lib/types";
import { Navbar } from "./navbar";
import { Footer } from "./footer";

export function SiteChrome({ children }: { children: React.ReactNode }) {
  const [institution, setInstitution] = useState<Institution | null>(null);

  useEffect(() => {
    fetchContent<Institution>("/institution").then(setInstitution);
  }, []);

  return (
    <div
      className="flex min-h-screen flex-col"
      style={
        {
          "--primary": institution?.primary_color ?? "#1a3c4a",
          "--secondary": institution?.secondary_color ?? "#2e7d9a",
        } as React.CSSProperties
      }
    >
      <Navbar institution={institution} />
      <main className="flex-1">{children}</main>
      <Footer institution={institution} />
    </div>
  );
}
