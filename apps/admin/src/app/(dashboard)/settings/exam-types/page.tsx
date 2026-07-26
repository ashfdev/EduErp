"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper,
  PageHeader,
  Card,
  CardContent,
  Button,
  Badge,
  Input,
  Label,
  Switch,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  EmptyState,
} from "@education-erp/ui";
import { examTypeConfigSchema, type ExamTypeConfigInput } from "@education-erp/validators";
import { api } from "@/lib/api";

interface ExamType extends ExamTypeConfigInput {
  id: string;
  is_active: boolean;
}
interface InstitutionConfig {
  result_calculation_mode: "TERM_BLEND" | "COURSE_GRADEBOOK" | null;
}

// Result Calculation Mode (Plan Fifteen, Phase I) — lives on this page since
// it's directly about how the Exam Types below (specifically their Weight
// in Annual %) get combined into a final result.
function ResultModeCard() {
  const queryClient = useQueryClient();
  const { data: config } = useQuery<InstitutionConfig>({
    queryKey: ["settings", "config"],
    queryFn: async () => (await api.get("/api/settings/config")).data.data,
  });

  const saveMutation = useMutation({
    mutationFn: (mode: string) => api.put("/api/settings/config", { result_calculation_mode: mode === "auto" ? null : mode }),
    onSuccess: () => {
      toast.success("Result calculation mode updated");
      queryClient.invalidateQueries({ queryKey: ["settings", "config"] });
    },
    onError: () => toast.error("Failed to update"),
  });

  return (
    <Card>
      <CardContent className="space-y-2 pt-6">
        <p className="font-medium">Result Calculation Mode</p>
        <p className="text-sm text-muted-foreground">
          Term-Based blends separate exams (Class Test, Half-Yearly, Annual — each weighted below) into one Combined Result.
          Course-Based (university) computes each course&apos;s grade from weighted components (CT/Mid/Assignment/Final/Attendance) —
          designed, not yet available in this build.
        </p>
        <select
          className="w-64 rounded-md border px-3 py-2 text-sm"
          value={config?.result_calculation_mode ?? "auto"}
          onChange={(e) => saveMutation.mutate(e.target.value)}
        >
          <option value="auto">Auto (based on institution type)</option>
          <option value="TERM_BLEND">Term-Based</option>
          <option value="COURSE_GRADEBOOK">Course-Based (university)</option>
        </select>
      </CardContent>
    </Card>
  );
}

export default function ExamTypesPage() {
  const queryClient = useQueryClient();
  const { data: types } = useQuery<ExamType[]>({
    queryKey: ["settings", "exam-types"],
    queryFn: async () => (await api.get("/api/settings/exam-types")).data.data,
  });

  const [open, setOpen] = useState(false);
  const { register, handleSubmit, reset, watch, setValue, formState: { isSubmitting } } = useForm<ExamTypeConfigInput>({
    resolver: zodResolver(examTypeConfigSchema),
    defaultValues: { weight_in_annual: 0, allows_absent_marking: true, has_practical: false, has_viva: false, practical_marks_separate: false, is_board_exam: false, display_order: (types?.length ?? 0) + 1 },
  });

  const createMutation = useMutation({
    mutationFn: (body: ExamTypeConfigInput) => api.post("/api/settings/exam-types", body),
    onSuccess: () => {
      toast.success("Exam type created");
      queryClient.invalidateQueries({ queryKey: ["settings", "exam-types"] });
      setOpen(false);
      reset();
    },
    onError: () => toast.error("Failed to create exam type"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/settings/exam-types/${id}`),
    onSuccess: () => {
      toast.success("Exam type removed");
      queryClient.invalidateQueries({ queryKey: ["settings", "exam-types"] });
    },
    onError: () => toast.error("This exam type is in use and cannot be deleted"),
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Exam Types"
        subtitle="Define exam categories and their rules"
        breadcrumbs={[{ label: "Settings" }, { label: "Exam Types" }]}
        action={<Button onClick={() => setOpen(true)}>+ Add Exam Type</Button>}
      />

      <ResultModeCard />

      {!types?.length && <EmptyState title="No exam types yet" />}

      <div className="grid grid-cols-3 gap-4">
        {types?.map((t) => (
          <Card key={t.id}>
            <CardContent className="space-y-2 pt-6">
              <div className="flex items-center justify-between">
                <p className="font-medium">{t.name}</p>
                <Badge variant="outline">{t.code}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">Weight: {t.weight_in_annual}%</p>
              <div className="flex flex-wrap gap-1">
                {t.has_practical && <Badge variant="secondary">Practical</Badge>}
                {t.is_board_exam && <Badge variant="secondary">Board Exam</Badge>}
              </div>
              <Button size="sm" variant="destructive" onClick={() => deleteMutation.mutate(t.id)}>Delete</Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Exam Type</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit((body) => createMutation.mutate(body))} className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input {...register("name")} placeholder="Half Yearly" /></div>
            <div className="space-y-1.5"><Label>Code</Label><Input {...register("code")} placeholder="HALF" /></div>
            <div className="space-y-1.5"><Label>Weight in Annual (%)</Label><Input type="number" {...register("weight_in_annual", { valueAsNumber: true })} /></div>
            <div className="space-y-1.5"><Label>Display Order</Label><Input type="number" {...register("display_order", { valueAsNumber: true })} /></div>
            <div className="flex items-center justify-between"><Label>Has practical</Label><Switch checked={watch("has_practical")} onCheckedChange={(v) => setValue("has_practical", v)} /></div>
            <div className="flex items-center justify-between"><Label>Has viva</Label><Switch checked={watch("has_viva")} onCheckedChange={(v) => setValue("has_viva", v)} /></div>
            <div className="flex items-center justify-between"><Label>Is board exam</Label><Switch checked={watch("is_board_exam")} onCheckedChange={(v) => setValue("is_board_exam", v)} /></div>
            <div className="flex items-center justify-between"><Label>Allow absent marking</Label><Switch checked={watch("allows_absent_marking")} onCheckedChange={(v) => setValue("allows_absent_marking", v)} /></div>
            <DialogFooter>
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Creating..." : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
