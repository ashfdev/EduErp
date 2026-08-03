"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  PageWrapper,
  PageHeader,
  Card,
  CardContent,
  SearchInput,
  StatusBadge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  EmptyState,
  ErrorState,
  LoadingSpinner,
  Button,
  extractErrorMessage,
} from "@education-erp/ui";
import { api } from "@/lib/api";

interface ClassOption {
  id: string;
  name_en: string;
}

interface CycleOption {
  id: string;
  name: string;
}

interface Application {
  id: string;
  admission_roll: string | null;
  applicant_name: string;
  status: string;
  merit_rank: number | null;
  created_at: string;
  payment_status: "NOT_REQUIRED" | "DUE" | "PARTIAL" | "PENDING_VERIFICATION" | "PAID";
  amount_due: number;
  amount_paid: number;
  cycle: { id: string; name: string; class: { id: string; name_en: string } };
}

const PAYMENT_STATUS_LABEL: Record<Application["payment_status"], string> = {
  NOT_REQUIRED: "N/A",
  DUE: "Due",
  PARTIAL: "Partial",
  PENDING_VERIFICATION: "Verifying",
  PAID: "Paid",
};
const PAYMENT_STATUS_CLASS: Record<Application["payment_status"], string> = {
  NOT_REQUIRED: "bg-muted text-muted-foreground",
  DUE: "bg-red-100 text-red-700",
  PARTIAL: "bg-amber-100 text-amber-700",
  PENDING_VERIFICATION: "bg-blue-100 text-blue-700",
  PAID: "bg-emerald-100 text-emerald-700",
};
function PaymentStatusBadge({ status }: { status: Application["payment_status"] }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${PAYMENT_STATUS_CLASS[status]}`}>{PAYMENT_STATUS_LABEL[status]}</span>;
}

// Every admission cycle a school is running, across every class and every
// session, in one filterable place -- previously staff had to open each
// cycle one at a time to see who applied (Plan Twenty-Three, Phase 4).
export default function AllAdmissionApplicationsPage() {
  const [search, setSearch] = useState("");
  const [classId, setClassId] = useState("");
  const [cycleId, setCycleId] = useState("");
  const [status, setStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [page, setPage] = useState(1);

  const { data: classes } = useQuery<ClassOption[]>({
    queryKey: ["settings", "classes"],
    queryFn: async () => (await api.get("/api/settings/classes")).data.data,
  });
  const { data: cycles } = useQuery<CycleOption[]>({
    queryKey: ["admission", "cycles", "all"],
    queryFn: async () => (await api.get("/api/admission/cycles")).data.data,
  });

  const { data, isLoading, isError, error, refetch } = useQuery<{ items: Application[]; meta: { total: number; page: number; totalPages: number } }>({
    queryKey: ["admission", "applications", "all", search, classId, cycleId, status, paymentStatus, page],
    queryFn: async () => {
      const res = await api.get("/api/admission/applications", {
        params: {
          search: search || undefined,
          class_id: classId || undefined,
          cycle_id: cycleId || undefined,
          status: status || undefined,
          payment_status: paymentStatus || undefined,
          page,
          limit: 20,
        },
      });
      return { items: res.data.data, meta: res.data.meta };
    },
  });

  return (
    <PageWrapper>
      <PageHeader
        title="All Applications"
        subtitle="Every applicant across every admission cycle, in one place"
        breadcrumbs={[{ label: "Admission", href: "/admission" }, { label: "All Applications" }]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          placeholder="Search by name or roll..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-64"
        />
        <select className="rounded-md border px-3 py-2 text-sm" value={classId} onChange={(e) => { setClassId(e.target.value); setPage(1); }}>
          <option value="">All Classes</option>
          {classes?.map((c) => (
            <option key={c.id} value={c.id}>{c.name_en}</option>
          ))}
        </select>
        <select className="rounded-md border px-3 py-2 text-sm" value={cycleId} onChange={(e) => { setCycleId(e.target.value); setPage(1); }}>
          <option value="">All Cycles</option>
          {cycles?.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select className="rounded-md border px-3 py-2 text-sm" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All Status</option>
          <option value="PENDING">Pending</option>
          <option value="SHORTLISTED">Shortlisted</option>
          <option value="WAITLISTED">Waitlisted</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="ENROLLED">Enrolled</option>
          <option value="REJECTED">Rejected</option>
        </select>
        <select className="rounded-md border px-3 py-2 text-sm" value={paymentStatus} onChange={(e) => { setPaymentStatus(e.target.value); setPage(1); }}>
          <option value="">All Payments</option>
          <option value="DUE">Due</option>
          <option value="PARTIAL">Partial</option>
          <option value="PENDING_VERIFICATION">Verifying</option>
          <option value="PAID">Paid</option>
          <option value="NOT_REQUIRED">N/A</option>
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : isError ? (
        <ErrorState title="Failed to load applications" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
      ) : !data?.items.length ? (
        <EmptyState title="No applications found" description="Try widening your filters." />
      ) : (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Roll</TableHead>
                  <TableHead>Applicant</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Cycle</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Applied On</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-xs">{a.admission_roll ?? "-"}</TableCell>
                    <TableCell><Link href={`/admission/applications/${a.id}`} className="text-primary hover:underline">{a.applicant_name}</Link></TableCell>
                    <TableCell>{a.cycle.class?.name_en ?? "-"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{a.cycle.name}</TableCell>
                    <TableCell><StatusBadge status={a.status} /></TableCell>
                    <TableCell><PaymentStatusBadge status={a.payment_status} /></TableCell>
                    <TableCell>{a.amount_due > 0 ? `৳${a.amount_due}` : "-"}</TableCell>
                    <TableCell>{new Date(a.created_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {data.meta.totalPages > 1 && (
              <div className="mt-4 flex items-center justify-center gap-3">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <span className="text-sm text-muted-foreground">Page {data.meta.page} of {data.meta.totalPages}</span>
                <Button size="sm" variant="outline" disabled={page >= data.meta.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </PageWrapper>
  );
}
