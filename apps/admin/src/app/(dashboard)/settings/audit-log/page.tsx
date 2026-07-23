"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  PageWrapper, PageHeader, Card, CardContent, Button, Label, EmptyState,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@education-erp/ui";
import { api } from "@/lib/api";

interface AuditLogEntry {
  id: string;
  action: string;
  user_id: string | null;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

const ACTIONS = ["LOGIN", "LOGOUT", "LOGIN_FAILED", "MARK_ENTRY_SUBMIT", "RESULT_APPROVE", "RESULT_PUBLISH", "FEE_WAIVE", "STUDENT_DELETE", "ROLE_CHANGE", "TEMPLATE_ACTIVATE"];

export default function AuditLogPage() {
  const [action, setAction] = useState<string>("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<{ items: AuditLogEntry[]; meta: { total: number; page: number; totalPages: number } }>({
    queryKey: ["settings", "audit-log", action, page],
    queryFn: async () => {
      const res = await api.get("/api/settings/audit-log", { params: { ...(action && { action }), page, limit: 50 } });
      return { items: res.data.data, meta: res.data.meta };
    },
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Audit Log"
        subtitle="Record of sensitive actions: logins, mark entry, result publish, fee waivers, role changes"
        breadcrumbs={[{ label: "Settings" }, { label: "Audit Log" }]}
      />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Action</Label>
            <Select value={action || "ALL"} onValueChange={(v) => { setAction(v === "ALL" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All actions</SelectItem>
                {ACTIONS.map((a) => <SelectItem key={a} value={a}>{a.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !data?.items.length ? (
            <EmptyState title="No audit log entries yet" description="Entries appear here as sensitive actions occur (logins, result publish, fee waivers, etc.)." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>User ID</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium">{log.action.replace(/_/g, " ")}</TableCell>
                    <TableCell className="font-mono text-xs">{log.user_id ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {log.target_type ? `${log.target_type}:${log.target_id}` : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>{log.ip_address ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-muted-foreground" title={JSON.stringify(log.metadata)}>
                      {log.metadata ? JSON.stringify(log.metadata) : ""}
                    </TableCell>
                    <TableCell>{new Date(log.created_at).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {data?.meta && data.meta.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <span className="text-sm text-muted-foreground">Page {data.meta.page} of {data.meta.totalPages}</span>
              <Button size="sm" variant="outline" disabled={page >= data.meta.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </PageWrapper>
  );
}
