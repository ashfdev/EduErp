"use client";

import { useEffect, useState } from "react";
import { fetchContent } from "@/lib/content-api";
import type { Institution, Notice } from "@/lib/types";
import { Navbar } from "./navbar";
import { Footer } from "./footer";
import { Megaphone } from "lucide-react";
import { Link } from "@/i18n/routing";

// globals.css defines --primary/--secondary as shadcn-style raw HSL triplets
// ("H S% L%"), consumed as hsl(var(--primary)) by every bg-primary/
// text-primary utility. InstitutionProfile stores colors as hex — feeding a
// hex string straight into that variable produces the invalid CSS
// hsl(#1a3c4a), which the browser silently drops. Convert once here so
// every existing bg-primary/text-primary usage across the site keeps working
// unchanged.
function hexToHslTriplet(hex: string): string {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!match) return hex;
  const r = parseInt(match[1]!, 16) / 255;
  const g = parseInt(match[2]!, 16) / 255;
  const b = parseInt(match[3]!, 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function SiteChrome({ children }: { children: React.ReactNode }) {
  const [institution, setInstitution] = useState<Institution | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);

  useEffect(() => {
    fetchContent<Institution>("/institution").then(setInstitution).catch(() => {});
    fetchContent<Notice[]>("/notices", { limit: "10" }).then((d) => setNotices(d ?? [])).catch(() => {});
  }, []);

  return (
    <div
      className="flex min-h-screen flex-col"
      style={
        {
          "--primary": hexToHslTriplet(institution?.primary_color ?? "#0B5ED7"),
          "--secondary": hexToHslTriplet(institution?.secondary_color ?? "#2563EB"),
        } as React.CSSProperties
      }
    >
      <Navbar institution={institution} notices={notices} />
      <main className="flex-1">{children}</main>
      <Footer institution={institution} />
    </div>
  );
}
