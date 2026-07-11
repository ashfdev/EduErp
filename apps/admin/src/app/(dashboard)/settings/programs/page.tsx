"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper,
  PageHeader,
  Card,
  CardContent,
  Button,
  Input,
  Label,
  EmptyState,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@education-erp/ui";
import { api } from "@/lib/api";

interface Department {
  id: string;
  name_en: string;
}
interface ProgramRow {
  id: string;
  name_en: string;
  code: string;
  duration_semesters: number;
  total_credit_hours: number;
  department: { name_en: string } | null;
  _count: { courses: number };
}

export default function ProgramsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [nameEn, setNameEn] = useState("");
  const [code, setCode] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [durationSemesters, setDurationSemesters] = useState(8);
  const [totalCreditHours, setTotalCreditHours] = useState(140);

  const { data: programs } = useQuery<ProgramRow[]>({
    queryKey: ["settings", "programs"],
    queryFn: async () => (await api.get("/api/settings/programs")).data.data,
  });
  const { data: departments } = useQuery<Department[]>({
    queryKey: ["settings", "departments"],
    queryFn: async () => (await api.get("/api/settings/departments")).data.data,
  });

  function resetForm() {
    setNameEn(""); setCode(""); setDepartmentId(""); setDurationSemesters(8); setTotalCreditHours(140);
  }

  const createMutation = useMutation({
    mutationFn: () =>
      api.post("/api/settings/programs", {
        name_en: nameEn,
        code,
        department_id: departmentId || undefined,
        duration_semesters: durationSemesters,
        total_credit_hours: totalCreditHours,
      }),
    onSuccess: () => {
      toast.success("Program created");
      queryClient.invalidateQueries({ queryKey: ["settings", "programs"] });
      setOpen(false);
      resetForm();
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? "Failed to create program";
      toast.error(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/settings/programs/${id}`),
    onSuccess: () => {
      toast.success("Program deleted");
      queryClient.invalidateQueries({ queryKey: ["settings", "programs"] });
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? "Failed to delete program";
      toast.error(message);
    },
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Programs & Courses"
        subtitle="University-mode academic structure — degree programs, their courses, credit hours, and prerequisites"
        breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Programs & Courses" }]}
        action={<Button onClick={() => setOpen(true)}>+ Add Program</Button>}
      />

      {!programs?.length && <EmptyState title="No programs yet" description="Create a program (e.g. BSc in CSE) to start adding courses." />}

      <div className="grid grid-cols-2 gap-4">
        {programs?.map((p) => (
          <Link key={p.id} href={`/settings/programs/${p.id}`}>
            <Card className="hover:border-primary">
              <CardContent className="space-y-1 pt-6">
                <p className="font-medium">{p.name_en} <span className="font-mono text-xs text-muted-foreground">{p.code}</span></p>
                <p className="text-sm text-muted-foreground">{p.department?.name_en ?? "No department"}</p>
                <p className="text-xs text-muted-foreground">
                  {p.duration_semesters} semesters · {p.total_credit_hours} credit hours · {p._count.courses} course(s)
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={(e) => {
                    e.preventDefault();
                    if (confirm(`Delete program "${p.name_en}"?`)) deleteMutation.mutate(p.id);
                  }}
                >
                  Delete
                </Button>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Program</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="e.g. BSc in Computer Science & Engineering" /></div>
            <div className="space-y-1.5"><Label>Code</Label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. BSC-CSE" /></div>
            <div className="space-y-1.5">
              <Label>Department (optional)</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                <option value="">None</option>
                {departments?.map((d) => <option key={d.id} value={d.id}>{d.name_en}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Duration (semesters)</Label><Input type="number" min={1} value={durationSemesters} onChange={(e) => setDurationSemesters(Number(e.target.value))} /></div>
              <div className="space-y-1.5"><Label>Total Credit Hours</Label><Input type="number" min={0} value={totalCreditHours} onChange={(e) => setTotalCreditHours(Number(e.target.value))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !nameEn || !code}>
              {createMutation.isPending ? "Creating..." : "Create Program"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
