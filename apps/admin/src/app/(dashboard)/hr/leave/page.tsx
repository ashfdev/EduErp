"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, StatusBadge, Tabs, TabsList, TabsTrigger, TabsContent, EmptyState, Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@education-erp/ui";
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Staff</TableHead><TableHead>Type</TableHead><TableHead>From</TableHead><TableHead>To</TableHead><TableHead>Reason</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leaves.map((l) => (
              <TableRow key={l.id}>
                <TableCell>{l.staff.name_en} <span className="font-mono text-xs text-muted-foreground">{l.staff.staff_uid}</span></TableCell>
                <TableCell>{l.leave_type.name}</TableCell>
                <TableCell>{new Date(l.from_date).toLocaleDateString()}</TableCell>
                <TableCell>{new Date(l.to_date).toLocaleDateString()}</TableCell>
                <TableCell>{l.reason}</TableCell>
                <TableCell><StatusBadge status={l.status} /></TableCell>
                <TableCell className="space-x-2">
                  {l.status === "PENDING" && (
                    <>
                      <Button size="sm" onClick={() => approveMutation.mutate(l.id)}>Approve</Button>
                      <Button size="sm" variant="destructive" onClick={() => rejectMutation.mutate(l.id)}>Reject</Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
