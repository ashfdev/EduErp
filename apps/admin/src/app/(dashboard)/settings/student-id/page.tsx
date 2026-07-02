"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper,
  PageHeader,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Label,
  Input,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Switch,
  Button,
  ConfirmDialog,
} from "@education-erp/ui";
import { studentIdConfigSchema, type StudentIdConfigInput } from "@education-erp/validators";
import { api } from "@/lib/api";

export default function StudentIdSettingsPage() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["settings", "student-id"],
    queryFn: async () => (await api.get("/api/settings/student-id-config")).data.data,
  });

  const { register, handleSubmit, reset, watch, setValue, formState: { isSubmitting } } = useForm<StudentIdConfigInput>({
    resolver: zodResolver(studentIdConfigSchema),
  });

  useEffect(() => {
    if (data) reset(data);
  }, [data, reset]);

  const values = watch();
  const [preview, setPreview] = useState<{ preview: string; examples: string[] } | null>(null);

  useEffect(() => {
    if (!values.prefix) return;
    const timeout = setTimeout(async () => {
      try {
        const res = await api.post("/api/settings/student-id-config/preview", values);
        setPreview(res.data.data);
      } catch {
        // ignore transient validation errors while typing
      }
    }, 200);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(values)]);

  const saveMutation = useMutation({
    mutationFn: (body: StudentIdConfigInput) => api.put("/api/settings/student-id-config", body),
    onSuccess: () => {
      toast.success("Student ID format saved");
      queryClient.invalidateQueries({ queryKey: ["settings", "student-id"] });
    },
    onError: () => toast.error("Failed to save student ID format"),
  });

  const [confirmReset, setConfirmReset] = useState(false);
  const resetMutation = useMutation({
    mutationFn: () => api.post("/api/settings/student-id-config/reset-sequence"),
    onSuccess: () => {
      toast.success("Sequence reset to 0");
      queryClient.invalidateQueries({ queryKey: ["settings", "student-id"] });
      setConfirmReset(false);
    },
  });

  return (
    <PageWrapper>
      <PageHeader title="Student ID Format" subtitle="Configure how new Student IDs are generated" breadcrumbs={[{ label: "Settings" }, { label: "Student ID Format" }]} />
      <form onSubmit={handleSubmit((body) => saveMutation.mutate(body))} className="grid grid-cols-2 gap-6">
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-1.5">
              <Label>Prefix</Label>
              <Input {...register("prefix")} placeholder="e.g. ALh, ASH" />
            </div>
            <div className="flex items-center justify-between">
              <Label>Include year</Label>
              <Switch checked={values.include_year} onCheckedChange={(v) => setValue("include_year", v)} />
            </div>
            {values.include_year && (
              <div className="space-y-1.5">
                <Label>Year format</Label>
                <Select value={values.year_format} onValueChange={(v) => setValue("year_format", v as "2" | "4")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">2-digit (24)</SelectItem>
                    <SelectItem value="4">4-digit (2024)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center justify-between">
              <Label>Include month</Label>
              <Switch checked={values.include_month} onCheckedChange={(v) => setValue("include_month", v)} />
            </div>
            <div className="space-y-1.5">
              <Label>Separator</Label>
              <Select value={values.separator} onValueChange={(v) => setValue("separator", v as "-" | "/" | "")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="-">- (dash)</SelectItem>
                  <SelectItem value="/">/ (slash)</SelectItem>
                  <SelectItem value="">(none)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Sequence digits</Label>
              <Input type="number" min={3} max={6} {...register("sequence_digits", { valueAsNumber: true })} />
            </div>
            <div className="space-y-1.5">
              <Label>Sequence scope</Label>
              <Select value={values.sequence_scope} onValueChange={(v) => setValue("sequence_scope", v as StudentIdConfigInput["sequence_scope"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="GLOBAL">Global</SelectItem>
                  <SelectItem value="YEARLY">Per Year</SelectItem>
                  <SelectItem value="CLASS">Per Class</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Save Changes"}</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Live Preview</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border bg-muted p-6 text-center font-mono text-2xl">{preview?.preview ?? "—"}</div>
            <div className="space-y-1 text-sm text-muted-foreground">
              {preview?.examples.map((ex, i) => (
                <p key={ex}>Student {i + 1}: <span className="font-mono">{ex}</span></p>
              ))}
            </div>
            {data?.preview_example && <p className="text-xs text-muted-foreground">Last issued: {data.preview_example}</p>}
            <Button type="button" variant="destructive" size="sm" onClick={() => setConfirmReset(true)}>
              Reset Sequence
            </Button>
          </CardContent>
        </Card>
      </form>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset ID sequence?"
        description="This resets the next-issued sequence number to 0. Existing student IDs are not affected."
        destructive
        loading={resetMutation.isPending}
        onConfirm={() => resetMutation.mutate()}
      />
    </PageWrapper>
  );
}
