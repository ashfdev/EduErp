"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, Checkbox, ConfirmDialog, EmptyState, PageHeader, PageWrapper, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";

interface ClassOption {
  id: string;
  name_en: string;
  sections: { id: string; name: string }[];
}
interface RosterStudent {
  id: string;
  student_uid: string;
  name_en: string;
  current_roll_no: string | null;
  phone: string | null;
  user_id: string | null;
}
interface BulkLoginResult {
  created: string[];
  linked: string[];
  skipped: { id: string; reason: string }[];
}

// "Ready" = has a phone on file and doesn't already have a login -- the same
// two requirements the single-student "Create Portal Login" button already
// enforces, just checked up front here so the roster can pre-select exactly
// the rows a bulk run would actually act on.
function rowStatus(s: RosterStudent): { ready: boolean; label: string } {
  if (s.user_id) return { ready: false, label: "Already has a login" };
  if (!s.phone) return { ready: false, label: "No phone on file" };
  return { ready: true, label: "Ready" };
}

export default function BulkCreateStudentLoginsPage() {
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<BulkLoginResult | null>(null);

  const { data: classes } = useQuery<ClassOption[]>({
    queryKey: ["settings", "classes", "all"],
    queryFn: async () => (await api.get("/api/settings/classes")).data.data,
  });
  const selectedClass = classes?.find((c) => c.id === classId);

  const { data: roster, isFetching: rosterLoading, refetch } = useQuery<RosterStudent[]>({
    queryKey: ["students", "login-roster", classId, sectionId],
    queryFn: async () => (await api.get("/api/students/login-roster", { params: { class_id: classId, section_id: sectionId || undefined } })).data.data,
    enabled: false,
  });

  function loadRoster() {
    setSelected(new Set());
    setResult(null);
    refetch().then((res) => {
      const readyIds = (res.data ?? []).filter((s) => rowStatus(s).ready).map((s) => s.id);
      setSelected(new Set(readyIds));
    });
  }

  function toggle(studentId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  // Resolved-count summary shown in the confirm dialog before anything is
  // sent -- this fires real SMS messages (real cost per message), so the
  // admin sees exactly how many before committing, same as the existing
  // Bulk SMS feature's own "never send blind" precedent.
  const summary = useMemo(() => {
    const alreadyHasLogin = roster?.filter((s) => s.user_id).length ?? 0;
    const noPhone = roster?.filter((s) => !s.user_id && !s.phone).length ?? 0;
    return { willCreate: selected.size, alreadyHasLogin, noPhone };
  }, [roster, selected]);

  const bulkLoginMutation = useMutation({
    mutationFn: () => api.post("/api/students/bulk-create-login", { student_ids: [...selected] }),
    onSuccess: (res) => {
      const data: BulkLoginResult = res.data.data;
      setResult(data);
      setSelected(new Set());
      setConfirmOpen(false);
      toast.success(
        `${data.created.length} login(s) created${data.linked.length ? `, ${data.linked.length} linked to an existing account` : ""}${data.skipped.length ? `, ${data.skipped.length} skipped` : ""}`,
      );
      refetch();
    },
    onError: (err: unknown) => {
      setConfirmOpen(false);
      toast.error(extractErrorMessage(err) ?? "Bulk login creation failed");
    },
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Bulk Create Student Logins"
        subtitle="Create portal logins for every student in a class/section who has a phone on file but no login yet"
        breadcrumbs={[{ label: "Students", href: "/students" }, { label: "Bulk Create Logins" }]}
      />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Class</p>
            <select
              className="w-56 rounded-md border px-3 py-2 text-sm"
              value={classId}
              onChange={(e) => { setClassId(e.target.value); setSectionId(""); }}
            >
              <option value="">Select class...</option>
              {classes?.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Section</p>
            <select className="w-40 rounded-md border px-3 py-2 text-sm" value={sectionId} onChange={(e) => setSectionId(e.target.value)} disabled={!classId}>
              <option value="">All Sections</option>
              {selectedClass?.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <Button size="sm" onClick={loadRoster} disabled={!classId || rosterLoading}>
            {rosterLoading ? "Loading..." : "Load Roster"}
          </Button>
        </CardContent>
      </Card>

      {roster && !roster.length && <EmptyState title="No active students in this class/section" />}

      {!!roster?.length && (
        <Card>
          <CardContent className="pt-6">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {roster.length} student(s) · {selected.size} selected
              </p>
              <Button onClick={() => setConfirmOpen(true)} disabled={!selected.size || bulkLoginMutation.isPending}>
                Create Logins for Selected ({selected.size})
              </Button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-2" />
                  <th className="p-2">Roll</th>
                  <th className="p-2">Student</th>
                  <th className="p-2">Phone</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((s) => {
                  const status = rowStatus(s);
                  return (
                    <tr key={s.id} className={`border-b ${!status.ready ? "opacity-50" : ""}`}>
                      <td className="p-2">
                        <Checkbox checked={selected.has(s.id)} disabled={!status.ready} onCheckedChange={() => toggle(s.id)} />
                      </td>
                      <td className="p-2">{s.current_roll_no ?? "—"}</td>
                      <td className="p-2">
                        <p className="font-medium">{s.name_en}</p>
                        <p className="font-mono text-xs text-muted-foreground">{s.student_uid}</p>
                      </td>
                      <td className="p-2">{s.phone || "—"}</td>
                      <td className="p-2">
                        {status.ready ? <Badge variant="success">Ready</Badge> : <Badge variant="secondary">{status.label}</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardContent className="space-y-2 pt-6">
            <p className="text-sm font-medium">Result</p>
            <p className="text-sm text-emerald-600">{result.created.length} new login(s) created and SMS&apos;d.</p>
            {!!result.linked.length && (
              <p className="text-sm text-muted-foreground">{result.linked.length} linked to an existing account with the same phone (no new password sent).</p>
            )}
            {!!result.skipped.length && (
              <div className="text-sm">
                <p className="text-amber-600">{result.skipped.length} skipped:</p>
                <ul className="ml-4 list-disc text-muted-foreground">
                  {result.skipped.map((s) => <li key={s.id}>{roster?.find((r) => r.id === s.id)?.name_en ?? s.id}: {s.reason}</li>)}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Create student logins?"
        description={
          `This will create ${summary.willCreate} new login(s) and send ${summary.willCreate} SMS message(s).` +
          (summary.alreadyHasLogin ? ` ${summary.alreadyHasLogin} already have logins (skipped).` : "") +
          (summary.noPhone ? ` ${summary.noPhone} have no phone on file (skipped).` : "") +
          " Continue?"
        }
        confirmLabel="Create Logins"
        loading={bulkLoginMutation.isPending}
        onConfirm={() => bulkLoginMutation.mutate()}
      />
    </PageWrapper>
  );
}
