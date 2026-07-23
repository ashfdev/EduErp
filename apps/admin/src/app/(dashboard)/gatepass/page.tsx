"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper, PageHeader, Card, CardContent, Button, Input, Label, StatusBadge, EmptyState,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  PdfPreviewModal,
  extractErrorMessage,
} from "@education-erp/ui";
import { api } from "@/lib/api";
import { usePdfPreview } from "@/hooks/use-pdf-preview";

interface StudentRow {
  id: string;
  name_en: string;
  student_uid: string;
}
interface VisitorRow {
  id: string;
  visitor_name: string;
  phone: string;
  visitor_type: string;
  relation_type: string | null;
  relation: string | null;
  reason: string;
  in_time: string;
  out_time: string | null;
  student: { id: string; name_en: string; student_uid: string } | null;
  class: { id: string; name_en: string } | null;
  section: { id: string; name: string } | null;
}

const VISITOR_TYPES = ["GUARDIAN", "VENDOR", "OFFICIAL", "OTHER"] as const;

function todayLocalDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function GatePassPage() {
  const queryClient = useQueryClient();
  const pdfPreview = usePdfPreview();
  const [open, setOpen] = useState(false);
  const [activeOnly, setActiveOnly] = useState(false);
  const [dateFilter, setDateFilter] = useState(todayLocalDateString());
  const [justLoggedIn, setJustLoggedIn] = useState<{ id: string; name: string } | null>(null);

  const [visitorType, setVisitorType] = useState<(typeof VISITOR_TYPES)[number]>("GUARDIAN");
  const [visitorName, setVisitorName] = useState("");
  const [phone, setPhone] = useState("");
  const [relationType, setRelationType] = useState("");
  const [relation, setRelation] = useState("");
  const [reason, setReason] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<StudentRow | null>(null);

  const { data: visitors } = useQuery<VisitorRow[]>({
    queryKey: ["gatepass", "visitors", activeOnly, dateFilter],
    queryFn: async () =>
      (await api.get("/api/gatepass/visitors", { params: { active: activeOnly ? "true" : undefined, date: activeOnly ? undefined : dateFilter } })).data.data,
  });

  const { data: studentResults } = useQuery<StudentRow[]>({
    queryKey: ["students", "search", studentSearch],
    queryFn: async () => (await api.get("/api/students", { params: { search: studentSearch, limit: 5 } })).data.data,
    enabled: studentSearch.length > 1 && !selectedStudent,
  });

  function resetForm() {
    setVisitorType("GUARDIAN");
    setVisitorName("");
    setPhone("");
    setRelationType("");
    setRelation("");
    setReason("");
    setStudentSearch("");
    setSelectedStudent(null);
  }

  const logInMutation = useMutation({
    mutationFn: () =>
      api.post("/api/gatepass/visitors", {
        visitor_type: visitorType,
        visitor_name: visitorName,
        phone,
        relation_type: relationType || undefined,
        relation: relation || undefined,
        reason,
        student_id: visitorType === "GUARDIAN" ? selectedStudent?.id : undefined,
      }),
    onSuccess: (res) => {
      toast.success("Visitor logged in");
      queryClient.invalidateQueries({ queryKey: ["gatepass", "visitors"] });
      setOpen(false);
      setJustLoggedIn({ id: res.data.data.id, name: res.data.data.visitor_name });
      resetForm();
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to log visitor"),
  });

  function downloadSlip(visitorId: string, visitorName: string) {
    pdfPreview.openPreview(`/api/documents/gatepass/${visitorId}/slip`, `Visitor Slip — ${visitorName}`);
  }

  const checkoutMutation = useMutation({
    mutationFn: (id: string) => api.put(`/api/gatepass/visitors/${id}/checkout`),
    onSuccess: () => {
      toast.success("Visitor checked out");
      queryClient.invalidateQueries({ queryKey: ["gatepass", "visitors"] });
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to check out visitor"),
  });

  const canSubmit = visitorName && phone && reason && (visitorType !== "GUARDIAN" || selectedStudent);

  return (
    <PageWrapper>
      <PageHeader
        title="Gate Pass"
        subtitle="Log and track campus visitors"
        breadcrumbs={[{ label: "Gate Pass" }]}
        action={<Button onClick={() => setOpen(true)}>+ Log Visitor In</Button>}
      />

      {justLoggedIn && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex items-center justify-between pt-6">
            <p className="text-sm">
              <strong>{justLoggedIn.name}</strong> logged in — download their visitor slip to hand over at the gate.
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => downloadSlip(justLoggedIn.id, justLoggedIn.name)}>Download Slip</Button>
              <Button size="sm" variant="outline" onClick={() => setJustLoggedIn(null)}>Dismiss</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Date</label>
          <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} disabled={activeOnly} className="w-40" />
        </div>
        <Button variant={activeOnly ? "default" : "outline"} size="sm" onClick={() => setActiveOnly((v) => !v)}>
          {activeOnly ? "Showing: Currently Inside" : "Show Currently Inside Only"}
        </Button>
      </div>

      {!visitors?.length && <EmptyState title="No visitor records" description="Try a different date, or log a new visitor in." />}

      {!!visitors?.length && (
        <Card>
          <CardContent className="pt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Visitor</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Visiting</TableHead>
                  <TableHead>Relation</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>In Time</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visitors.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.visitor_name}</TableCell>
                    <TableCell>{v.visitor_type}</TableCell>
                    <TableCell>{v.student ? `${v.student.name_en} (${v.student.student_uid})` : "—"}</TableCell>
                    <TableCell>{v.relation ?? "—"}</TableCell>
                    <TableCell>{v.phone}</TableCell>
                    <TableCell className="max-w-[200px] truncate" title={v.reason}>{v.reason}</TableCell>
                    <TableCell>{new Date(v.in_time).toLocaleString()}</TableCell>
                    <TableCell>{v.out_time ? <StatusBadge status="CHECKED_OUT" /> : <StatusBadge status="INSIDE" />}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => downloadSlip(v.id, v.visitor_name)}>
                          Slip
                        </Button>
                        {!v.out_time && (
                          <Button size="sm" variant="outline" onClick={() => checkoutMutation.mutate(v.id)}>
                            Check Out
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log Visitor In</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Visitor Type</Label>
              <Select value={visitorType} onValueChange={(v) => { setVisitorType(v as (typeof VISITOR_TYPES)[number]); setSelectedStudent(null); setStudentSearch(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VISITOR_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {visitorType === "GUARDIAN" && (
              <div className="space-y-2">
                <Label>Student</Label>
                {selectedStudent ? (
                  <div className="flex items-center justify-between rounded-md border p-2 text-sm">
                    <span>{selectedStudent.name_en} ({selectedStudent.student_uid})</span>
                    <Button size="sm" variant="outline" onClick={() => setSelectedStudent(null)}>Change</Button>
                  </div>
                ) : (
                  <>
                    <Input placeholder="Search student..." value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} />
                    {studentResults?.map((s) => (
                      <button key={s.id} onClick={() => setSelectedStudent(s)} className="block w-full rounded-md border p-2 text-left text-sm hover:bg-accent">
                        {s.name_en} ({s.student_uid})
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}

            <div className="space-y-1.5"><Label>Visitor Name</Label><Input value={visitorName} onChange={(e) => setVisitorName(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Relation Type</Label><Input placeholder="e.g. Sibling/Uncle" value={relationType} onChange={(e) => setRelationType(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Relation</Label><Input placeholder="e.g. Father" value={relation} onChange={(e) => setRelation(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Reason for Visit</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button disabled={!canSubmit || logInMutation.isPending} onClick={() => logInMutation.mutate()}>
              {logInMutation.isPending ? "Logging in..." : "Log In"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PdfPreviewModal
        open={pdfPreview.open}
        onOpenChange={(o) => !o && pdfPreview.closePreview()}
        title={pdfPreview.title}
        pdfUrl={pdfPreview.url}
      />
    </PageWrapper>
  );
}
