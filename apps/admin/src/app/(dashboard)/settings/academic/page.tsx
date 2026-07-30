"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, EmptyState, Input, Label, PageHeader, PageWrapper, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";

interface AcademicYear {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

interface Shift {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
}

interface ShiftPeriodRow {
  id: string;
  period_no: number;
  start_time: string;
  end_time: string;
  is_break: boolean;
}

interface SectionRow {
  id: string;
  name: string;
  capacity: number;
  shift_id: string | null;
  shift: { id: string; name: string; start_time: string; end_time: string } | null;
  class_teacher: { id: string; name_en: string } | null;
  _count: { students: number };
}

interface Teacher {
  id: string;
  name_en: string;
  designation: string;
}

interface GroupRow {
  id: string;
  name_en: string;
  code: string;
  display_order: number;
  _count: { students: number };
}

interface ClassRow {
  id: string;
  name_en: string;
  numeric_level: number;
  sections: SectionRow[];
  groups: GroupRow[];
  _count: { students: number };
}

export default function AcademicSettingsPage() {
  const queryClient = useQueryClient();

  const { data: years } = useQuery<AcademicYear[]>({
    queryKey: ["settings", "academic-years"],
    queryFn: async () => (await api.get("/api/settings/academic-years")).data.data,
  });
  const { data: shifts } = useQuery<Shift[]>({
    queryKey: ["settings", "shifts"],
    queryFn: async () => (await api.get("/api/settings/shifts")).data.data,
  });
  const { data: programs } = useQuery<{ id: string; name_en: string }[]>({
    queryKey: ["settings", "programs"],
    queryFn: async () => (await api.get("/api/settings/programs")).data.data,
  });
  const { data: classes } = useQuery<ClassRow[]>({
    queryKey: ["settings", "classes"],
    queryFn: async () => (await api.get("/api/settings/classes")).data.data,
  });
  const { data: teachers } = useQuery<Teacher[]>({
    queryKey: ["staff", "teachers"],
    queryFn: async () => (await api.get("/api/staff/teachers")).data.data,
  });

  const [yearOpen, setYearOpen] = useState(false);
  const [yearForm, setYearForm] = useState({ label: "", start_date: "", end_date: "" });
  const createYear = useMutation({
    mutationFn: () => api.post("/api/settings/academic-years", yearForm),
    onSuccess: () => {
      toast.success("Academic year created");
      queryClient.invalidateQueries({ queryKey: ["settings", "academic-years"] });
      setYearOpen(false);
    },
  });
  const activateYear = useMutation({
    mutationFn: (id: string) => api.post(`/api/settings/academic-years/${id}/activate`),
    onSuccess: () => {
      toast.success("Active academic year updated");
      queryClient.invalidateQueries({ queryKey: ["settings", "academic-years"] });
    },
  });

  const [shiftOpen, setShiftOpen] = useState(false);
  const [shiftForm, setShiftForm] = useState({ name: "", start_time: "", end_time: "" });
  const createShift = useMutation({
    mutationFn: () => api.post("/api/settings/shifts", shiftForm),
    onSuccess: () => {
      toast.success("Shift created");
      queryClient.invalidateQueries({ queryKey: ["settings", "shifts"] });
      setShiftOpen(false);
    },
  });

  const [periodsShiftId, setPeriodsShiftId] = useState<string | null>(null);
  const emptyPeriodForm = { period_no: 1, start_time: "", end_time: "", is_break: false };
  const [periodForm, setPeriodForm] = useState(emptyPeriodForm);
  const { data: periods } = useQuery<ShiftPeriodRow[]>({
    queryKey: ["settings", "shift-periods", periodsShiftId],
    queryFn: async () => (await api.get(`/api/settings/shifts/${periodsShiftId}/periods`)).data.data,
    enabled: !!periodsShiftId,
  });
  const createPeriod = useMutation({
    mutationFn: () => api.post(`/api/settings/shifts/${periodsShiftId}/periods`, periodForm),
    onSuccess: () => {
      toast.success("Period added");
      queryClient.invalidateQueries({ queryKey: ["settings", "shift-periods", periodsShiftId] });
      setPeriodForm({ ...emptyPeriodForm, period_no: periodForm.period_no + 1 });
    },
    onError: (err: unknown) => {
      const message = extractErrorMessage(err) ?? "Failed to add period";
      toast.error(message);
    },
  });
  const deletePeriod = useMutation({
    mutationFn: (periodId: string) => api.delete(`/api/settings/shifts/${periodsShiftId}/periods/${periodId}`),
    onSuccess: () => {
      toast.success("Period removed");
      queryClient.invalidateQueries({ queryKey: ["settings", "shift-periods", periodsShiftId] });
    },
  });

  const [classOpen, setClassOpen] = useState(false);
  const [classForm, setClassForm] = useState({ name_en: "", numeric_level: 1, academic_year_id: "", program_id: "" });
  const createClass = useMutation({
    mutationFn: () => api.post("/api/settings/classes", { ...classForm, program_id: classForm.program_id || undefined }),
    onSuccess: () => {
      toast.success("Class created");
      queryClient.invalidateQueries({ queryKey: ["settings", "classes"] });
      setClassOpen(false);
    },
  });

  const emptySectionForm = { name: "", shift_id: "", capacity: 50 };
  const [sectionClassId, setSectionClassId] = useState<string | null>(null);
  const [sectionForm, setSectionForm] = useState(emptySectionForm);
  const createSection = useMutation({
    mutationFn: () =>
      api.post(`/api/settings/classes/${sectionClassId}/sections`, {
        name: sectionForm.name,
        shift_id: sectionForm.shift_id || null,
        capacity: sectionForm.capacity,
      }),
    onSuccess: () => {
      toast.success("Section added");
      queryClient.invalidateQueries({ queryKey: ["settings", "classes"] });
      setSectionClassId(null);
      setSectionForm(emptySectionForm);
    },
  });

  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editSectionForm, setEditSectionForm] = useState({ ...emptySectionForm, class_teacher_id: "" });
  function openEditSection(s: SectionRow) {
    setEditingSectionId(s.id);
    setEditSectionForm({ name: s.name, shift_id: s.shift_id ?? "", capacity: s.capacity, class_teacher_id: s.class_teacher?.id ?? "" });
  }
  const updateSection = useMutation({
    mutationFn: () =>
      api.put(`/api/settings/sections/${editingSectionId}`, {
        name: editSectionForm.name,
        shift_id: editSectionForm.shift_id || null,
        capacity: editSectionForm.capacity,
      }),
    onSuccess: () => {
      toast.success("Section updated");
      queryClient.invalidateQueries({ queryKey: ["settings", "classes"] });
      setEditingSectionId(null);
    },
    onError: (err: unknown) => {
      const message = extractErrorMessage(err) ?? "Failed to update section";
      toast.error(message);
    },
  });
  const updateClassTeacher = useMutation({
    mutationFn: () =>
      api.put(`/api/settings/sections/${editingSectionId}/class-teacher`, {
        class_teacher_id: editSectionForm.class_teacher_id || null,
      }),
    onSuccess: () => {
      toast.success("Class teacher updated");
      queryClient.invalidateQueries({ queryKey: ["settings", "classes"] });
      setEditingSectionId(null);
    },
    onError: (err: unknown) => {
      const message = extractErrorMessage(err) ?? "Failed to update class teacher";
      toast.error(message);
    },
  });

  const emptyGroupForm = { name_en: "", code: "" };
  const [groupClassId, setGroupClassId] = useState<string | null>(null);
  const [groupForm, setGroupForm] = useState(emptyGroupForm);
  const createGroup = useMutation({
    mutationFn: () => api.post(`/api/settings/classes/${groupClassId}/groups`, groupForm),
    onSuccess: () => {
      toast.success("Group added");
      queryClient.invalidateQueries({ queryKey: ["settings", "classes"] });
      setGroupClassId(null);
      setGroupForm(emptyGroupForm);
    },
    onError: (err: unknown) => {
      const message = extractErrorMessage(err) ?? "Failed to add group";
      toast.error(message);
    },
  });

  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupForm, setEditGroupForm] = useState(emptyGroupForm);
  function openEditGroup(g: GroupRow) {
    setEditingGroupId(g.id);
    setEditGroupForm({ name_en: g.name_en, code: g.code });
  }
  const updateGroup = useMutation({
    mutationFn: () => api.put(`/api/settings/groups/${editingGroupId}`, editGroupForm),
    onSuccess: () => {
      toast.success("Group updated");
      queryClient.invalidateQueries({ queryKey: ["settings", "classes"] });
      setEditingGroupId(null);
    },
    onError: (err: unknown) => {
      const message = extractErrorMessage(err) ?? "Failed to update group";
      toast.error(message);
    },
  });
  const deleteGroup = useMutation({
    mutationFn: (id: string) => api.delete(`/api/settings/groups/${id}`),
    onSuccess: () => {
      toast.success("Group removed");
      queryClient.invalidateQueries({ queryKey: ["settings", "classes"] });
      setEditingGroupId(null);
    },
    onError: (err: unknown) => {
      const message = extractErrorMessage(err) ?? "Failed to remove group";
      toast.error(message);
    },
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Academic Structure"
        subtitle="Academic years, shifts, classes, sections, and groups/streams (Science/Commerce/Arts) — add a class's groups from its card below"
        breadcrumbs={[{ label: "Settings" }, { label: "Academic" }]}
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Academic Years</CardTitle>
          <Button size="sm" onClick={() => setYearOpen(true)}>+ Add Academic Year</Button>
        </CardHeader>
        <CardContent>
          {!years?.length && <EmptyState title="No academic years yet" />}
          <Table>
            <TableBody>
              {years?.map((y) => (
                <TableRow key={y.id}>
                  <TableCell className="font-medium">{y.label}</TableCell>
                  <TableCell className="text-muted-foreground">{new Date(y.start_date).toLocaleDateString()} – {new Date(y.end_date).toLocaleDateString()}</TableCell>
                  <TableCell>{y.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="outline">Inactive</Badge>}</TableCell>
                  <TableCell>
                    {!y.is_active && <Button size="sm" variant="outline" onClick={() => activateYear.mutate(y.id)}>Set Active</Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Shifts</CardTitle>
          <Button size="sm" onClick={() => setShiftOpen(true)}>+ Add Shift</Button>
        </CardHeader>
        <CardContent>
          {!shifts?.length && <EmptyState title="No shifts yet" />}
          <div className="flex flex-wrap gap-2">
            {shifts?.map((s) => (
              <div key={s.id} className="flex items-center gap-1">
                <Badge variant="outline">{s.name} ({s.start_time}–{s.end_time})</Badge>
                <Button size="sm" variant="ghost" onClick={() => { setPeriodsShiftId(s.id); setPeriodForm(emptyPeriodForm); }}>Periods</Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Classes & Sections</CardTitle>
          <Button size="sm" onClick={() => setClassOpen(true)}>+ Add Class</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {!classes?.length && <EmptyState title="No classes yet" />}
          {classes?.map((c) => (
            <div key={c.id} className="rounded-md border p-3">
              <div className="flex items-center justify-between">
                <p className="font-medium">{c.name_en} <span className="text-sm text-muted-foreground">({c._count.students} students)</span></p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setSectionClassId(c.id)}>+ Add Section</Button>
                  <Button size="sm" variant="outline" onClick={() => setGroupClassId(c.id)}>+ Add Group</Button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {c.sections.map((s) => (
                  <button key={s.id} type="button" onClick={() => openEditSection(s)} className="cursor-pointer">
                    <Badge variant="secondary">
                      {s.name} ({s._count.students}/{s.capacity}){s.shift ? ` — ${s.shift.name}` : " — no shift"}
                    </Badge>
                  </button>
                ))}
              </div>
              {!!c.groups.length && (
                <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2">
                  <span className="text-xs text-muted-foreground">Groups/Streams:</span>
                  {c.groups.map((g) => (
                    <button key={g.id} type="button" onClick={() => openEditGroup(g)} className="cursor-pointer">
                      <Badge variant="outline">{g.name_en} ({g._count.students})</Badge>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={yearOpen} onOpenChange={setYearOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Academic Year</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Label</Label><Input value={yearForm.label} onChange={(e) => setYearForm({ ...yearForm, label: e.target.value })} placeholder="2026-2027" /></div>
            <div className="space-y-1.5"><Label>Start Date</Label><Input type="date" value={yearForm.start_date} onChange={(e) => setYearForm({ ...yearForm, start_date: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>End Date</Label><Input type="date" value={yearForm.end_date} onChange={(e) => setYearForm({ ...yearForm, end_date: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={() => createYear.mutate()} disabled={createYear.isPending}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={shiftOpen} onOpenChange={setShiftOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Shift</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input value={shiftForm.name} onChange={(e) => setShiftForm({ ...shiftForm, name: e.target.value })} placeholder="Morning" /></div>
            <div className="space-y-1.5"><Label>Start Time</Label><Input type="time" value={shiftForm.start_time} onChange={(e) => setShiftForm({ ...shiftForm, start_time: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>End Time</Label><Input type="time" value={shiftForm.end_time} onChange={(e) => setShiftForm({ ...shiftForm, end_time: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={() => createShift.mutate()} disabled={createShift.isPending}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={classOpen} onOpenChange={setClassOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Class</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input value={classForm.name_en} onChange={(e) => setClassForm({ ...classForm, name_en: e.target.value })} placeholder="Class 9" /></div>
            <div className="space-y-1.5"><Label>Numeric Level (for ordering)</Label><Input type="number" value={classForm.numeric_level} onChange={(e) => setClassForm({ ...classForm, numeric_level: Number(e.target.value) })} /></div>
            <div className="space-y-1.5">
              <Label>Academic Year</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={classForm.academic_year_id} onChange={(e) => setClassForm({ ...classForm, academic_year_id: e.target.value })}>
                <option value="">Select...</option>
                {years?.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Program (university mode only — leave unset otherwise)</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={classForm.program_id} onChange={(e) => setClassForm({ ...classForm, program_id: e.target.value })}>
                <option value="">None</option>
                {programs?.map((p) => <option key={p.id} value={p.id}>{p.name_en}</option>)}
              </select>
            </div>
          </div>
          <DialogFooter><Button onClick={() => createClass.mutate()} disabled={createClass.isPending || !classForm.academic_year_id}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!sectionClassId} onOpenChange={(v) => !v && setSectionClassId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Section</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input value={sectionForm.name} onChange={(e) => setSectionForm({ ...sectionForm, name: e.target.value })} placeholder="A" /></div>
            <div className="space-y-1.5">
              <Label>Shift (optional)</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={sectionForm.shift_id} onChange={(e) => setSectionForm({ ...sectionForm, shift_id: e.target.value })}>
                <option value="">None</option>
                {shifts?.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.start_time}–{s.end_time})</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Capacity</Label>
              <Input type="number" min={1} value={sectionForm.capacity} onChange={(e) => setSectionForm({ ...sectionForm, capacity: Number(e.target.value) })} />
            </div>
          </div>
          <DialogFooter><Button onClick={() => createSection.mutate()} disabled={createSection.isPending || !sectionForm.name}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingSectionId} onOpenChange={(v) => !v && setEditingSectionId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Section</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input value={editSectionForm.name} onChange={(e) => setEditSectionForm({ ...editSectionForm, name: e.target.value })} /></div>
            <div className="space-y-1.5">
              <Label>Shift (optional)</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={editSectionForm.shift_id} onChange={(e) => setEditSectionForm({ ...editSectionForm, shift_id: e.target.value })}>
                <option value="">None</option>
                {shifts?.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.start_time}–{s.end_time})</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Capacity</Label>
              <Input type="number" min={1} value={editSectionForm.capacity} onChange={(e) => setEditSectionForm({ ...editSectionForm, capacity: Number(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label>Class Teacher (optional)</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={editSectionForm.class_teacher_id} onChange={(e) => setEditSectionForm({ ...editSectionForm, class_teacher_id: e.target.value })}>
                <option value="">None</option>
                {teachers?.map((t) => <option key={t.id} value={t.id}>{t.name_en} ({t.designation})</option>)}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={async () => {
                await updateSection.mutateAsync();
                await updateClassTeacher.mutateAsync();
              }}
              disabled={updateSection.isPending || updateClassTeacher.isPending || !editSectionForm.name}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!groupClassId} onOpenChange={(v) => !v && setGroupClassId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Group / Stream</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input value={groupForm.name_en} onChange={(e) => setGroupForm({ ...groupForm, name_en: e.target.value })} placeholder="Science" /></div>
            <div className="space-y-1.5"><Label>Code</Label><Input value={groupForm.code} onChange={(e) => setGroupForm({ ...groupForm, code: e.target.value })} placeholder="SCI" /></div>
          </div>
          <DialogFooter><Button onClick={() => createGroup.mutate()} disabled={createGroup.isPending || !groupForm.name_en || !groupForm.code}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingGroupId} onOpenChange={(v) => !v && setEditingGroupId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Group / Stream</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input value={editGroupForm.name_en} onChange={(e) => setEditGroupForm({ ...editGroupForm, name_en: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Code</Label><Input value={editGroupForm.code} onChange={(e) => setEditGroupForm({ ...editGroupForm, code: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="destructive" onClick={() => editingGroupId && deleteGroup.mutate(editingGroupId)} disabled={deleteGroup.isPending}>Delete</Button>
            <Button onClick={() => updateGroup.mutate()} disabled={updateGroup.isPending || !editGroupForm.name_en || !editGroupForm.code}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!periodsShiftId} onOpenChange={(v) => !v && setPeriodsShiftId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Shift Periods</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {!periods?.length && <EmptyState title="No periods configured yet" />}
            {!!periods?.length && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Break?</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {periods.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.period_no}</TableCell>
                      <TableCell>{p.start_time}–{p.end_time}</TableCell>
                      <TableCell>{p.is_break ? "Break" : ""}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="destructive" onClick={() => deletePeriod.mutate(p.id)}>Delete</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <div className="grid grid-cols-4 gap-2 border-t pt-3">
              <div className="space-y-1.5">
                <Label>Period #</Label>
                <Input type="number" min={1} value={periodForm.period_no} onChange={(e) => setPeriodForm({ ...periodForm, period_no: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>Start</Label>
                <Input type="time" value={periodForm.start_time} onChange={(e) => setPeriodForm({ ...periodForm, start_time: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>End</Label>
                <Input type="time" value={periodForm.end_time} onChange={(e) => setPeriodForm({ ...periodForm, end_time: e.target.value })} />
              </div>
              <div className="flex items-end gap-2">
                <label className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={periodForm.is_break} onChange={(e) => setPeriodForm({ ...periodForm, is_break: e.target.checked })} />
                  Break
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => createPeriod.mutate()} disabled={createPeriod.isPending || !periodForm.start_time || !periodForm.end_time}>
              {createPeriod.isPending ? "Adding..." : "Add Period"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
