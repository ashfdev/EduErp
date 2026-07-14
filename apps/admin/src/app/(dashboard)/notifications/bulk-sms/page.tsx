"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper, PageHeader, Card, CardContent, Button, Textarea,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Badge,
} from "@education-erp/ui";
import { api } from "@/lib/api";

interface ClassOption {
  id: string;
  name_en: string;
  sections: { id: string; name: string }[];
}

const AUDIENCES = [
  { value: "STUDENTS", label: "Students (via guardian phone)" },
  { value: "GUARDIANS", label: "Guardians" },
  { value: "STAFF", label: "Staff" },
  { value: "ALL", label: "Everyone" },
];

const STAFF_ROLES = [
  "PRINCIPAL", "VICE_PRINCIPAL", "EXAM_CONTROLLER", "HEAD_OF_DEPT", "CLASS_TEACHER", "SUBJECT_TEACHER",
  "ACCOUNTANT", "LIBRARIAN", "TRANSPORT_MANAGER", "HOSTEL_MANAGER", "REGISTRAR", "IT_ADMIN",
];

export default function BulkSmsPage() {
  const [audience, setAudience] = useState("STUDENTS");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [staffRole, setStaffRole] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<{ count: number; sample: string[] } | null>(null);

  const { data: classes } = useQuery<ClassOption[]>({
    queryKey: ["settings", "classes"],
    queryFn: async () => (await api.get("/api/settings/classes")).data.data,
  });
  const selectedClass = classes?.find((c) => c.id === classId);

  function buildBody() {
    return {
      audience,
      class_id: audience === "STAFF" ? undefined : classId || undefined,
      section_id: audience === "STAFF" ? undefined : sectionId || undefined,
      staff_role: audience === "STAFF" || audience === "ALL" ? staffRole || undefined : undefined,
      message,
    };
  }

  const previewMutation = useMutation({
    mutationFn: () => api.post("/api/notifications/bulk-sms/preview", buildBody()),
    onSuccess: (res) => setPreview(res.data.data),
    onError: (err: unknown) => toast.error((err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? "Could not resolve recipients"),
  });

  const sendMutation = useMutation({
    mutationFn: () => api.post("/api/notifications/bulk-sms", buildBody()),
    onSuccess: (res) => {
      toast.success(`Queued ${res.data.data.queued} SMS`);
      setMessage("");
      setPreview(null);
    },
    onError: (err: unknown) => toast.error((err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? "Failed to send"),
  });

  return (
    <PageWrapper>
      <PageHeader title="Bulk SMS" subtitle="Message many students, guardians, or staff at once" breadcrumbs={[{ label: "Bulk SMS" }]} />

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Audience</label>
              <Select value={audience} onValueChange={(v) => { setAudience(v); setPreview(null); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AUDIENCES.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {audience !== "STAFF" && (
              <>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Class (optional filter)</label>
                  <Select value={classId} onValueChange={(v) => { setClassId(v); setSectionId(""); setPreview(null); }}>
                    <SelectTrigger><SelectValue placeholder="All classes" /></SelectTrigger>
                    <SelectContent>
                      {classes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name_en}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Section (optional filter)</label>
                  <Select value={sectionId} onValueChange={(v) => { setSectionId(v); setPreview(null); }} disabled={!selectedClass}>
                    <SelectTrigger><SelectValue placeholder="All sections" /></SelectTrigger>
                    <SelectContent>
                      {selectedClass?.sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {(audience === "STAFF" || audience === "ALL") && (
              <div>
                <label className="mb-1.5 block text-sm font-medium">Staff role (optional filter)</label>
                <Select value={staffRole} onValueChange={(v) => { setStaffRole(v); setPreview(null); }}>
                  <SelectTrigger><SelectValue placeholder="All staff roles" /></SelectTrigger>
                  <SelectContent>
                    {STAFF_ROLES.map((r) => <SelectItem key={r} value={r}>{r.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Message</label>
            <Textarea
              value={message}
              onChange={(e) => { setMessage(e.target.value); setPreview(null); }}
              maxLength={640}
              rows={4}
              placeholder="Type the message to send..."
            />
            <p className="mt-1 text-xs text-muted-foreground">{message.length}/640 characters</p>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="outline" disabled={previewMutation.isPending} onClick={() => previewMutation.mutate()}>
              {previewMutation.isPending ? "Checking..." : "Preview Recipients"}
            </Button>
            {preview && (
              <>
                <Badge variant={preview.count > 0 ? "default" : "outline"}>{preview.count} recipient{preview.count === 1 ? "" : "s"}</Badge>
                {preview.sample.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    e.g. {preview.sample.slice(0, 3).join(", ")}{preview.count > 3 ? ", ..." : ""}
                  </span>
                )}
              </>
            )}
          </div>

          <Button
            disabled={!preview || preview.count === 0 || !message.trim() || sendMutation.isPending}
            onClick={() => sendMutation.mutate()}
          >
            {sendMutation.isPending ? "Sending..." : preview ? `Send to ${preview.count} Recipient${preview.count === 1 ? "" : "s"}` : "Preview first"}
          </Button>
        </CardContent>
      </Card>
    </PageWrapper>
  );
}
