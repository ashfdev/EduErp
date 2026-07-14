"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

interface Cycle {
  id: string;
  name: string;
  class: { name_en: string; name_bn?: string };
  open_date: string;
  close_date: string;
  seat_count: number;
  app_fee: number;
  is_open: boolean;
}

export default function AdmissionListPage() {
  const t = useTranslations("admission");
  const [cycles, setCycles] = useState<Cycle[] | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/admission/public/cycles`)
      .then((r) => r.json())
      .then((body) => setCycles(body.data ?? []))
      .catch(() => setCycles([]));
  }, []);

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="mb-2 text-2xl font-semibold">{t("title")}</h1>
      <p className="mb-6 text-sm text-gray-600">{t("subtitle")}</p>

      {cycles === null && <p className="text-sm text-gray-600">{t("loading")}</p>}
      {cycles?.length === 0 && <p className="text-sm text-gray-600">{t("noCycles")}</p>}

      <div className="space-y-4">
        {cycles?.map((c) => (
          <div key={c.id} className="rounded-md border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{c.name}</p>
                <p className="text-sm text-gray-600">{c.class.name_en}</p>
              </div>
              <span className={`rounded-full px-2 py-1 text-xs font-medium ${c.is_open ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                {c.is_open ? t("open") : t("closed")}
              </span>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              {t("dateRangeSeats", { openDate: new Date(c.open_date).toLocaleDateString(), closeDate: new Date(c.close_date).toLocaleDateString(), seats: c.seat_count, fee: c.app_fee })}
            </p>
            <div className="mt-3 flex gap-4">
              {c.is_open && (
                <Link href={`/admission/${c.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                  {t("applyNow")}
                </Link>
              )}
              <Link href="/admission/status" className="text-sm text-gray-600 hover:underline">
                {t("checkStatus")}
              </Link>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
