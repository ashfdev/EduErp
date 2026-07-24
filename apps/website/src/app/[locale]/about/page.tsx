"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/routing";

export default function AboutIndexPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/about/about");
  }, [router]);
  return null;
}
