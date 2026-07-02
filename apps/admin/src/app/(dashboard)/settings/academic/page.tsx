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

  const [classOpen, setClassOpen] = useState(false);
  const [classForm, setClassForm] = useState({ name_en: "", numeric_level: 1, academic_year_id: "" });
  const createClass = useMutation({
    mutationFn: () => api.post("/api/settings/classes", classForm),
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
              <Badge key={s.id} variant="outline">{s.name} ({s.start_time}–{s.end_time})</Badge>
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
    </PageWrapper>
  );
}
