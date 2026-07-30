"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  PageWrapper, PageHeader, Card, CardContent, Button, Label, StatusBadge, EmptyState,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  ErrorState, extractErrorMessage,
} from "@education-erp/ui";
import { api } from "@/lib/api";

interface NotificationLog {
  id: string;
  trigger: string | null;
  channel: string;
  recipient: string;
  status: string;
  message: string | null;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
}

const STATUSES = ["QUEUED", "SENT", "FAILED", "SKIPPED"];
const CHANNELS = ["SMS", "EMAIL", "PUSH"];
const TRIGGERS = ["ABSENCE", "LATE", "FEE_DUE", "RESULT_PUBLISHED", "NOTICE", "ADMISSION_CONFIRM", "PORTAL_LOGIN_CREATED", "EXAM_SCHEDULED"];

export default function NotificationLogsPage() {
  const [status, setStatus] = useState<string>("");
  const [channel, setChannel] = useState<string>("");
  const [trigger, setTrigger] = useState<string>("");
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error, refetch } = useQuery<{ items: NotificationLog[]; meta: { total: number; page: number; totalPages: number } }>({
    queryKey: ["settings", "notifications", "logs", status, channel, trigger, page],
    queryFn: async () => {
      const res = await api.get("/api/settings/notifications/logs", {
        params: {
          ...(status && { status }),
          ...(channel && { channel }),
          ...(trigger && { trigger }),
          page,
          limit: 50,
        },
      });
      return { items: res.data.data, meta: res.data.meta };
    },
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Notification Logs"
        subtitle="Delivery audit trail for every SMS/Email/Push send"
        breadcrumbs={[{ label: "Settings" }, { label: "Notifications" }, { label: "Logs" }]}
      />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select value={status || "ALL"} onValueChange={(v) => { setStatus(v === "ALL" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Channel</Label>
            <Select value={channel || "ALL"} onValueChange={(v) => { setChannel(v === "ALL" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All channels</SelectItem>
                {CHANNELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Trigger</Label>
            <Select value={trigger || "ALL"} onValueChange={(v) => { setTrigger(v === "ALL" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All triggers</SelectItem>
                {TRIGGERS.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : isError ? (
            <ErrorState title="Failed to load notification logs" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
          ) : !data?.items.length ? (
            <EmptyState title="No notification logs yet" description="Logs appear here as soon as an SMS, email, or push notification is queued." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Channel</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent At</TableHead>
                  <TableHead>Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>{log.channel}</TableCell>
                    <TableCell>{log.trigger?.replace(/_/g, " ") ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>{log.recipient}</TableCell>
                    <TableCell>
                      <StatusBadge status={log.status} />
                    </TableCell>
                    <TableCell>{log.sent_at ? new Date(log.sent_at).toLocaleString() : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="max-w-xs truncate" title={log.error_message ?? log.message ?? ""}>
                      {log.status === "FAILED" ? <span className="text-red-500">{log.error_message}</span> : log.message}
                    </TableCell>
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
