"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { PortalShell } from "@/components/portal-shell";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Card, CardContent, Button, LoadingSpinner } from "@education-erp/ui";

interface Clearance {
  accounts: { required: boolean; clear: boolean; due_amount: number };
  library: { clear: boolean; fine_amount: number };
  exam_office: { clear: boolean };
  all_clear: boolean;
}

function ClearanceRow({ label, clear, detail }: { label: string; clear: boolean; detail?: string }) {
  return (
    <div className="flex items-center justify-between border-b py-2 text-sm last:border-0">
      <div>
        <p>{label}</p>
        {detail && <p className="text-xs text-gray-500">{detail}</p>}
      </div>
      <span className={clear ? "text-emerald-600" : "text-red-600"}>{clear ? "✓ Clear" : "✗ Pending"}</span>
    </div>
  );
}

function AdmitCardContent() {
  const { exam_id } = useParams<{ exam_id: string }>();
  const { activeStudentId } = useAuthStore();

  const { data, isLoading } = useQuery<Clearance>({
    queryKey: ["portal", "admit-card-clearance", activeStudentId, exam_id],
    queryFn: async () => (await api.get(`/api/portal/student/${activeStudentId}/admit-card/${exam_id}/clearance`)).data.data,
    enabled: !!activeStudentId,
  });

  async function download() {
    const res = await api.get(`/api/portal/student/${activeStudentId}/admit-card/${exam_id}`, { responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = "admit-card.pdf";
    a.click();
  }

  if (isLoading) return <div className="flex min-h-[50vh] items-center justify-center"><LoadingSpinner /></div>;

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-lg font-semibold">Admit Card</h1>

      <Card>
        <CardContent className="pt-6">
          <p className="mb-2 font-medium">Clearance Status</p>
          {data?.accounts.required && (
            <ClearanceRow label="Accounts" clear={data.accounts.clear} detail={data.accounts.clear ? undefined : `৳${data.accounts.due_amount} due`} />
          )}
          {data && (
            <>
              <ClearanceRow label="Library" clear={data.library.clear} detail={data.library.clear ? undefined : `৳${data.library.fine_amount} fine`} />
              <ClearanceRow label="Exam Office" clear={data.exam_office.clear} detail={data.exam_office.clear ? undefined : "Awaiting sign-off"} />
            </>
          )}
        </CardContent>
      </Card>

      {data?.all_clear ? (
        <Button className="w-full" onClick={download}>Download Admit Card</Button>
      ) : (
        <p className="text-center text-sm text-gray-500">Clear all pending items above to unlock your admit card.</p>
      )}
    </div>
  );
}

export default function AdmitCardPage() {
  return (
    <PortalShell>
      <AdmitCardContent />
    </PortalShell>
  );
}
