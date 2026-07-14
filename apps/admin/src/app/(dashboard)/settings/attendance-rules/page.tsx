"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Label, Input, Switch, Button } from "@education-erp/ui";
import { attendanceRulesSchema, type AttendanceRulesInput } from "@education-erp/validators";
import { api } from "@/lib/api";

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// Bangladesh default when unset: Sat-Thu working, Friday off.
const DEFAULT_WORKING_DAYS = [0, 1, 2, 3, 4, 6];

export default function AttendanceRulesPage() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["settings", "attendance-rules"],
    queryFn: async () => (await api.get("/api/settings/attendance-rules")).data.data,
  });

  const { register, handleSubmit, reset, watch, setValue, formState: { isSubmitting } } = useForm<AttendanceRulesInput>({
    resolver: zodResolver(attendanceRulesSchema),
  });

  useEffect(() => {
    if (data) reset(data);
  }, [data, reset]);

  const saveMutation = useMutation({
    mutationFn: (body: AttendanceRulesInput) => api.put("/api/settings/attendance-rules", body),
    onSuccess: () => {
      toast.success("Attendance rules updated");
      queryClient.invalidateQueries({ queryKey: ["settings", "attendance-rules"] });
    },
    onError: () => toast.error("Failed to update attendance rules"),
  });

  return (
    <PageWrapper>
      <PageHeader title="Attendance Rules" subtitle="Working days, late windows, and notification triggers" breadcrumbs={[{ label: "Settings" }, { label: "Attendance Rules" }]} />
      <form onSubmit={handleSubmit((body) => saveMutation.mutate(body))} className="max-w-2xl space-y-6">
        <Card>
          <CardContent className="grid grid-cols-2 gap-4 pt-6">
            <div className="space-y-1.5">
              <Label>Minimum attendance %</Label>
              <Input type="number" {...register("min_attendance_percentage", { valueAsNumber: true })} />
            </div>
            <div className="space-y-1.5">
              <Label>Late arrival window (minutes)</Label>
              <Input type="number" {...register("late_arrival_window_minutes", { valueAsNumber: true })} />
            </div>
            <div className="space-y-1.5">
              <Label>Working days per week</Label>
              <Input type="number" {...register("working_days_per_week", { valueAsNumber: true })} />
            </div>
            <div className="space-y-1.5">
              <Label>N lates = 1 absent</Label>
              <Input type="number" {...register("count_late_as_absent_after", { valueAsNumber: true })} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 pt-6">
            <Label>Which days are working days</Label>
            <p className="text-xs text-muted-foreground">
              Used by the routine auto-generator to know which days to schedule classes on. Defaults to Saturday–Thursday (Friday off) if left unset.
            </p>
            <div className="flex flex-wrap gap-3">
              {DAY_LABELS.map((label, day) => {
                const current = (watch("working_days") as number[] | null | undefined) ?? DEFAULT_WORKING_DAYS;
                const checked = current.includes(day);
                return (
                  <label key={day} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const next = e.target.checked ? [...current, day] : current.filter((d) => d !== day);
                        setValue("working_days", next.sort((a, b) => a - b));
                      }}
                    />
                    {label}
                  </label>
                );
              })}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="flex items-center justify-between">
              <Label>SMS on absence</Label>
              <Switch checked={watch("sms_on_absent")} onCheckedChange={(v) => setValue("sms_on_absent", v)} />
            </div>
            <div className="flex items-center justify-between">
              <Label>SMS on late</Label>
              <Switch checked={watch("sms_on_late")} onCheckedChange={(v) => setValue("sms_on_late", v)} />
            </div>
          </CardContent>
        </Card>
        <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Save Changes"}</Button>
      </form>
    </PageWrapper>
  );
}
