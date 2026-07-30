"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper,
  PageHeader,
  Card,
  CardContent,
  Button,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  EmptyState,
  ErrorState,
  LoadingSpinner,
  extractErrorMessage,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Textarea,
} from "@education-erp/ui";
import { api } from "@/lib/api";

interface RiskStudent {
  student_id: string;
  name_en: string;
  student_uid: string;
  father_phone: string | null;
  class_name: string | null;
  section_name: string | null;
  attendance_percentage: number | null;
  days_overdue: number;
  total_due: number;
  risk_score: number;
}
interface ClassOption {
  id: string;
  name_en: string;
  sections?: { id: string; name: string }[];
  groups?: { id: string; name_en: string }[];
}

function riskColor(score: number) {
  if (score >= 40) return "text-red-600";
  if (score >= 20) return "text-orange-600";
  return "text-yellow-600";
}

export default function AtRiskStudentsPage() {
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [messageStudentId, setMessageStudentId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");

  const { data: classes } = useQuery<ClassOption[]>({
    queryKey: ["settings", "classes"],
    queryFn: async () => (await api.get("/api/settings/classes")).data.data,
  });
  const selectedClass = classes?.find((c) => c.id === classId);

  const { data: students, isLoading, isError, error, refetch } = useQuery<RiskStudent[]>({
    queryKey: ["analytics", "defaulters-risk", classId, sectionId, groupId],
    queryFn: async () =>
      (await api.get("/api/analytics/defaulters-risk", { params: { class_id: classId || undefined, section_id: sectionId || undefined, group_id: groupId || undefined } })).data.data,
  });

  const draftMutation = useMutation({
    mutationFn: (studentId: string) => api.get(`/api/analytics/defaulters-risk/${studentId}/message-draft`),
    onSuccess: (res, studentId) => {
      setMessageStudentId(studentId);
      setMessageText(res.data.data.message);
    },
    onError: () => toast.error("Failed to generate message draft"),
  });

  const sendMutation = useMutation({
    mutationFn: () => api.post(`/api/analytics/defaulters-risk/${messageStudentId}/send-message`, { message: messageText }),
    onSuccess: () => {
      toast.success("Message sent to guardian");
      setMessageStudentId(null);
      setMessageText("");
    },
    onError: () => toast.error("Failed to send message"),
  });

  const messageStudent = students?.find((s) => s.student_id === messageStudentId);

  return (
    <PageWrapper>
      <PageHeader
        title="At-Risk Students"
        subtitle="Low attendance or long-overdue fees — configurable in Settings → Attendance Rules"
        breadcrumbs={[{ label: "Students", href: "/students" }, { label: "At-Risk" }]}
      />

      <div className="flex gap-3">
        <Select value={classId || "all"} onValueChange={(v) => { setClassId(v === "all" ? "" : v); setSectionId(""); setGroupId(""); }}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All Classes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Classes</SelectItem>
            {classes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name_en}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sectionId || "all"} onValueChange={(v) => setSectionId(v === "all" ? "" : v)}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All Sections" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sections</SelectItem>
            {selectedClass?.sections?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {!!selectedClass?.groups?.length && (
          <Select value={groupId || "all"} onValueChange={(v) => setGroupId(v === "all" ? "" : v)}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All Groups" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Groups</SelectItem>
              {selectedClass.groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name_en}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Button variant="outline" onClick={() => refetch()}>Refresh</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : isError ? (
        <ErrorState title="Failed to load at-risk students" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
      ) : (
        <>
      {!students?.length && <EmptyState title="No at-risk students" description="Everyone in this filter meets the configured attendance and fee-due thresholds." />}

      {!!students?.length && (
        <Card>
          <CardContent className="pt-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-2">Student</th>
                  <th className="p-2">Class / Section</th>
                  <th className="p-2">Attendance</th>
                  <th className="p-2">Days Overdue</th>
                  <th className="p-2">Total Due</th>
                  <th className="p-2">Risk</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.student_id} className="border-b">
                    <td className="p-2">
                      <Link href={`/students/${s.student_id}`} className="font-medium hover:underline">{s.name_en}</Link>
                      <div className="font-mono text-xs text-muted-foreground">{s.student_uid}</div>
                    </td>
                    <td className="p-2">{s.class_name} {s.section_name && `· ${s.section_name}`}</td>
                    <td className="p-2">{s.attendance_percentage !== null ? `${s.attendance_percentage}%` : "—"}</td>
                    <td className="p-2">{s.days_overdue || "—"}</td>
                    <td className="p-2">৳{s.total_due}</td>
                    <td className={`p-2 font-semibold ${riskColor(s.risk_score)}`}>{s.risk_score}</td>
                    <td className="p-2">
                      <Button size="sm" variant="outline" disabled={!s.father_phone || draftMutation.isPending} onClick={() => draftMutation.mutate(s.student_id)}>
                        Message Guardian
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
        </>
      )}

      <Dialog open={!!messageStudentId} onOpenChange={(v) => !v && setMessageStudentId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Message Guardian — {messageStudent?.name_en}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Auto-generated from this student&apos;s current risk factors — edit freely before sending.</p>
            <Textarea value={messageText} onChange={(e) => setMessageText(e.target.value)} rows={5} />
          </div>
          <DialogFooter>
            <Button onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending || !messageText.trim()}>
              {sendMutation.isPending ? "Sending..." : "Send SMS"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
