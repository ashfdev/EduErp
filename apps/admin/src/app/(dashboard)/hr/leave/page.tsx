"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, StatusBadge, Tabs, TabsList, TabsTrigger, TabsContent, EmptyState } from "@education-erp/ui";
import { api } from "@/lib/api";

interface LeaveRequest {
  id: string;
  staff: { name_en: string; staff_uid: string };
  leave_type: { name: string };
  from_date: string;
  to_date: string;
  reason: string;
  status: string;
}

function LeaveTable({ status }: { status: string }) {
  const queryClient = useQueryClient();
  const { data: leaves } = useQuery<LeaveRequest[]>({
    queryKey: ["hr", "leaves", status],
    queryFn: async () => (await api.get("/api/hr/leaves", { params: status === "ALL" ? {} : { status } })).data.data,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.put(`/api/hr/leaves/${id}/approve`),
    onSuccess: () => {
      toast.success("Leave approved");
      queryClient.invalidateQueries({ queryKey: ["hr", "leaves"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.put(`/api/hr/leaves/${id}/reject`, { reason: "Not approved" }),
    onSuccess: () => {
      toast.success("Leave rejected");
      queryClient.invalidateQueries({ queryKey: ["hr", "leaves"] });
    },
  });

  if (!leaves?.length) return <EmptyState title="No leave requests" />;

  return (
    <Card>
      <CardContent className="pt-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="p-2">Staff</th><th className="p-2">Type</th><th className="p-2">From</th><th className="p-2">To</th><th className="p-2">Reason</th><th className="p-2">Status</th><th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {leaves.map((l) => (
              <tr key={l.id} className="border-b">
                <td className="p-2">{l.staff.name_en} <span className="font-mono text-xs text-muted-foreground">{l.staff.staff_uid}</span></td>
                <td className="p-2">{l.leave_type.name}</td>
                <td className="p-2">{new Date(l.from_date).toLocaleDateString()}</td>
                <td className="p-2">{new Date(l.to_date).toLocaleDateString()}</td>
                <td className="p-2">{l.reason}</td>
                <td className="p-2"><StatusBadge status={l.status} /></td>
                <td className="p-2 space-x-2">
                  {l.status === "PENDING" && (
                    <>
                      <Button size="sm" onClick={() => approveMutation.mutate(l.id)}>Approve</Button>
                      <Button size="sm" variant="destructive" onClick={() => rejectMutation.mutate(l.id)}>Reject</Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

export default function LeaveManagementPage() {
  const [tab, setTab] = useState("PENDING");

  return (
    <PageWrapper>
      <PageHeader title="Leave Management" breadcrumbs={[{ label: "HR", href: "/hr" }, { label: "Leave" }]} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="PENDING">Pending</TabsTrigger>
          <TabsTrigger value="APPROVED">Approved</TabsTrigger>
          <TabsTrigger value="REJECTED">Rejected</TabsTrigger>
          <TabsTrigger value="ALL">All</TabsTrigger>
        </TabsList>
        <TabsContent value={tab}><LeaveTable status={tab} /></TabsContent>
      </Tabs>
    </PageWrapper>
  );
}
