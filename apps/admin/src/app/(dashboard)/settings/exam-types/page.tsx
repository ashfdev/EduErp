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
