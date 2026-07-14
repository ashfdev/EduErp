"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper,
  PageHeader,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Badge,
  Input,
  Label,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  EmptyState,
} from "@education-erp/ui";
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

interface ClassRow {
  id: string;
  name_en: string;
  numeric_level: number;
  sections: { id: string; name: string; _count: { students: number } }[];
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
      const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? "Failed to add period";
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

  const [sectionClassId, setSectionClassId] = useState<string | null>(null);
  const [sectionName, setSectionName] = useState("");
  const createSection = useMutation({
    mutationFn: () => api.post(`/api/settings/classes/${sectionClassId}/sections`, { name: sectionName }),
    onSuccess: () => {
      toast.success("Section added");
      queryClient.invalidateQueries({ queryKey: ["settings", "classes"] });
      setSectionClassId(null);
      setSectionName("");
    },
  });

  return (
    <PageWrapper>
      <PageHeader title="Academic Structure" subtitle="Academic years, shifts, classes, and sections" breadcrumbs={[{ label: "Settings" }, { label: "Academic" }]} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Academic Years</CardTitle>
          <Button size="sm" onClick={() => setYearOpen(true)}>+ Add Academic Year</Button>
        </CardHeader>
        <CardContent>
          {!years?.length && <EmptyState title="No academic years yet" />}
          <table className="w-full text-sm">
            <tbody>
              {years?.map((y) => (
                <tr key={y.id} className="border-b">
                  <td className="p-2 font-medium">{y.label}</td>
                  <td className="p-2 text-muted-foreground">{new Date(y.start_date).toLocaleDateString()} – {new Date(y.end_date).toLocaleDateString()}</td>
                  <td className="p-2">{y.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="outline">Inactive</Badge>}</td>
                  <td className="p-2">
                    {!y.is_active && <Button size="sm" variant="outline" onClick={() => activateYear.mutate(y.id)}>Set Active</Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
                <Button size="sm" variant="outline" onClick={() => setSectionClassId(c.id)}>+ Add Section</Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {c.sections.map((s) => (
                  <Badge key={s.id} variant="secondary">{s.name} ({s._count.students})</Badge>
                ))}
              </div>
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
          <div className="space-y-1.5"><Label>Name</Label><Input value={sectionName} onChange={(e) => setSectionName(e.target.value)} placeholder="A" /></div>
          <DialogFooter><Button onClick={() => createSection.mutate()} disabled={createSection.isPending}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!periodsShiftId} onOpenChange={(v) => !v && setPeriodsShiftId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Shift Periods</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {!periods?.length && <EmptyState title="No periods configured yet" />}
            {!!periods?.length && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-1">#</th>
                    <th className="p-1">Time</th>
                    <th className="p-1">Break?</th>
                    <th className="p-1" />
                  </tr>
                </thead>
                <tbody>
                  {periods.map((p) => (
                    <tr key={p.id} className="border-b">
                      <td className="p-1">{p.period_no}</td>
                      <td className="p-1">{p.start_time}–{p.end_time}</td>
                      <td className="p-1">{p.is_break ? "Break" : ""}</td>
                      <td className="p-1 text-right">
                        <Button size="sm" variant="destructive" onClick={() => deletePeriod.mutate(p.id)}>Delete</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
