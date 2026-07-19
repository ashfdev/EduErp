"use client";

import { useTranslations } from "next-intl";
import { DirectoryList } from "@/components/directory-list";

export default function StaffPage() {
  const t = useTranslations("faculty");
  return <DirectoryList category="STAFF" title={t("staffTitle")} subtitle={t("staffSubtitle")} />;
}
