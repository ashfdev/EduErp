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
  ErrorState,
  LoadingSpinner,
} from "@education-erp/ui";
import { api } from "@/lib/api";
import { usePdfPreview } from "@/hooks/use-pdf-preview";

interface StudentRow {
  id: string;
  name_en: string;
  student_uid: string;
  current_class: { id: string; name_en: string } | null;
  current_section: { id: string; name: string } | null;
}
interface ClassOption {
  id: string;
  name_en: string;
  sections?: { id: string; name: string }[];
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
  const [pickerClassId, setPickerClassId] = useState("");
  const [pickerSectionId, setPickerSectionId] = useState("");

  const { data: visitors, isLoading, isError, error, refetch } = useQuery<VisitorRow[]>({
    queryKey: ["gatepass", "visitors", activeOnly, dateFilter],
    queryFn: async () =>
      (await api.get("/api/gatepass/visitors", { params: { active: activeOnly ? "true" : undefined, date: activeOnly ? undefined : dateFilter } })).data.data,
  });

  const { data: classes } = useQuery<ClassOption[]>({
    queryKey: ["settings", "classes"],
    queryFn: async () => (await api.get("/api/settings/classes")).data.data,
  });
  const pickerClass = classes?.find((c) => c.id === pickerClassId);

  const { data: studentResults } = useQuery<StudentRow[]>({
    queryKey: ["students", "search", studentSearch, pickerClassId, pickerSectionId],
    queryFn: async () =>
      (
        await api.get("/api/students", {
          params: { search: studentSearch, class_id: pickerClassId || undefined, section_id: pickerSectionId || undefined, limit: 8 },
        })
      ).data.data,
    enabled: (studentSearch.length > 1 || !!pickerClassId) && !selectedStudent,
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
    setPickerClassId("");
    setPickerSectionId("");
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
        class_id: visitorType === "GUARDIAN" ? (selectedStudent?.current_class?.id ?? undefined) : undefined,
        section_id: visitorType === "GUARDIAN" ? (selectedStudent?.current_section?.id ?? undefined) : undefined,
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

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : isError ? (
        <ErrorState title="Failed to load visitor records" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
      ) : (
        <>
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
                        <TableCell>
                          {v.student ? (
                            <>
                              {v.student.name_en} ({v.student.student_uid})
                              {v.class && (
                                <span className="block text-xs text-muted-foreground">
                                  {v.class.name_en}{v.section ? ` / ${v.section.name}` : ""}
                                </span>
                              )}
                            </>
                          ) : (
                            "—"
                          )}
                        </TableCell>
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
        </>
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
                    <span>
                      {selectedStudent.name_en} ({selectedStudent.student_uid})
                      {selectedStudent.current_class && (
                        <span className="text-muted-foreground">
                          {" — "}{selectedStudent.current_class.name_en}
                          {selectedStudent.current_section ? ` / ${selectedStudent.current_section.name}` : ""}
                        </span>
                      )}
                    </span>
                    <Button size="sm" variant="outline" onClick={() => setSelectedStudent(null)}>Change</Button>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <Select value={pickerClassId || "all"} onValueChange={(v) => { setPickerClassId(v === "all" ? "" : v); setPickerSectionId(""); }}>
                        <SelectTrigger><SelectValue placeholder="All Classes" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Classes</SelectItem>
                          {classes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name_en}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={pickerSectionId || "all"} onValueChange={(v) => setPickerSectionId(v === "all" ? "" : v)} disabled={!pickerClass?.sections?.length}>
                        <SelectTrigger><SelectValue placeholder="All Sections" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Sections</SelectItem>
                          {pickerClass?.sections?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <Input placeholder="Search student..." value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} />
                    {studentResults?.map((s) => (
                      <button key={s.id} onClick={() => setSelectedStudent(s)} className="block w-full rounded-md border p-2 text-left text-sm hover:bg-accent">
                        {s.name_en} ({s.student_uid})
                        {s.current_class && (
                          <span className="text-muted-foreground"> — {s.current_class.name_en}{s.current_section ? ` / ${s.current_section.name}` : ""}</span>
                        )}
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
