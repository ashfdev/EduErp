"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { TeacherShell } from "@/components/teacher-shell";
import { Button, Card, CardContent, Input, Label, PageHeader, PageWrapper, StatusBadge, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";

interface LeaveType {
  id: string;
  name: string;
  days_allowed: number;
  is_paid: boolean;
}
interface LeaveBalance {
  leave_type: LeaveType;
  total_allowed: number;
  used: number;
  remaining: number;
}
interface LeaveRequestRow {
  id: string;
  from_date: string;
  to_date: string;
  reason: string;
  status: string;
  leave_type: LeaveType;
  rejection_reason: string | null;
}

export default function TeacherLeavePage() {
  const queryClient = useQueryClient();
  const t = useTranslations("leave");
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("");

  const { data: leaveTypes } = useQuery<LeaveType[]>({ queryKey: ["hr", "leave-types"], queryFn: async () => (await api.get("/api/hr/leave-types")).data.data });
  const { data: balance } = useQuery<LeaveBalance[]>({ queryKey: ["hr", "leaves", "balance", "me"], queryFn: async () => (await api.get("/api/hr/leaves/balance/me")).data.data });
  const { data: history } = useQuery<LeaveRequestRow[]>({ queryKey: ["hr", "leaves", "me"], queryFn: async () => (await api.get("/api/hr/leaves")).data.data });

  const applyMutation = useMutation({
    mutationFn: () => api.post("/api/hr/leaves/apply", { staff_id: "me", leave_type_id: leaveTypeId, from_date: fromDate, to_date: toDate, reason }),
    onSuccess: () => {
      toast.success(t("requestSubmitted"));
      setLeaveTypeId(""); setFromDate(""); setToDate(""); setReason("");
      queryClient.invalidateQueries({ queryKey: ["hr", "leaves"] });
    },
    onError: (err: unknown) => {
      const message = extractErrorMessage(err) ?? t("submitFailed");
      toast.error(message);
    },
  });

  return (
    <TeacherShell>
      <PageWrapper className="p-0">
        <PageHeader title={t("title")} subtitle={t("subtitle")} />

        <Card>
          <CardContent className="pt-6">
            <p className="mb-3 text-sm font-medium">{t("leaveBalance")}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {balance?.map((b) => (
                <div key={b.leave_type.id} className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">{b.leave_type.name}</p>
                  <p className="text-lg font-semibold">{b.remaining}<span className="text-xs font-normal text-muted-foreground">{t("leftSuffix", { total: b.total_allowed })}</span></p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 pt-6">
            <p className="text-sm font-medium">{t("applyForLeave")}</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t("leaveType")}</Label>
                <select className="w-full rounded-md border px-3 py-2 text-sm" value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)}>
                  <option value="">{t("select")}</option>
                  {leaveTypes?.map((lt) => <option key={lt.id} value={lt.id}>{lt.name}</option>)}
                </select>
              </div>
              <div />
              <div className="space-y-1.5">
                <Label>{t("from")}</Label>
                <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("to")}</Label>
                <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>{t("reason")}</Label>
                <textarea
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            </div>
            <Button
              disabled={!leaveTypeId || !fromDate || !toDate || !reason || applyMutation.isPending}
              onClick={() => applyMutation.mutate()}
            >
              {applyMutation.isPending ? t("submitting") : t("submitRequest")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <p className="mb-3 text-sm font-medium">{t("myRequests")}</p>
            {!history?.length && <p className="text-sm text-muted-foreground">{t("noRequests")}</p>}
            <div className="space-y-2">
              {history?.map((h) => (
                <div key={h.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                  <div>
                    <p className="font-medium">{h.leave_type.name} — {new Date(h.from_date).toLocaleDateString()} to {new Date(h.to_date).toLocaleDateString()}</p>
                    <p className="text-xs text-muted-foreground">{h.reason}</p>
                    {h.status === "REJECTED" && h.rejection_reason && <p className="text-xs text-red-600">{t("rejectionReason", { reason: h.rejection_reason })}</p>}
                  </div>
                  <StatusBadge status={h.status} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </PageWrapper>
    </TeacherShell>
  );
}
