"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  PageWrapper, PageHeader, Card, CardContent, Button, Label, EmptyState,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-4">Action</th>
                    <th className="py-2 pr-4">User ID</th>
                    <th className="py-2 pr-4">Target</th>
                    <th className="py-2 pr-4">IP</th>
                    <th className="py-2 pr-4">Details</th>
                    <th className="py-2 pr-4">When</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((log) => (
                    <tr key={log.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">{log.action.replace(/_/g, " ")}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{log.user_id ?? <span className="text-muted-foreground">—</span>}</td>
                      <td className="py-2 pr-4 font-mono text-xs">
                        {log.target_type ? `${log.target_type}:${log.target_id}` : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-2 pr-4">{log.ip_address ?? <span className="text-muted-foreground">—</span>}</td>
                      <td className="max-w-xs truncate py-2 pr-4 text-xs text-muted-foreground" title={JSON.stringify(log.metadata)}>
                        {log.metadata ? JSON.stringify(log.metadata) : ""}
                      </td>
                      <td className="py-2 pr-4">{new Date(log.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
