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
            <div className="space-y-1.5">
              <Label>Subject pass-rate &quot;good&quot; threshold (%)</Label>
              <Input type="number" {...register("pass_rate_alert_threshold", { valueAsNumber: true })} />
              <p className="text-xs text-muted-foreground">
                Used by the exam results page to badge a subject as good vs needs-attention.
              </p>
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
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-1.5">
              <Label>Promotion eligibility — which attendance counts?</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" {...register("promotion_attendance_mode")}>
                <option value="DAILY_ATTENDANCE_ONLY">Daily/homeroom attendance only (today&apos;s existing rule)</option>
                <option value="AVERAGE_ALL_SUBJECTS">Average across all subjects</option>
                <option value="EVERY_SUBJECT_MINIMUM">Every subject must individually meet the minimum</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Controls how attendance is checked when deciding if a student can be promoted. &quot;Daily/homeroom&quot;
                uses the same calculation this system has always used; the other two use real per-subject attendance
                (once teachers are marking it) — average pools every subject together, while &quot;every subject&quot; blocks
                promotion if any single subject falls below the minimum.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Minimum sessions before a subject counts (Every Subject mode)</Label>
              <Input type="number" min={1} {...register("promotion_min_sessions_per_subject", { valueAsNumber: true })} />
              <p className="text-xs text-muted-foreground">
                A subject with fewer recorded sessions than this so far this year is skipped in the &quot;every subject&quot;
                check — so a brand-new elective with only 1-2 classes so far can&apos;t block a promotion.
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1.5 pt-6">
            <Label>Marksheet / Report Card — which attendance shows?</Label>
            <select className="w-full rounded-md border px-3 py-2 text-sm" {...register("exam_attendance_source")}>
              <option value="SUBJECT_WISE">Subject-wise attendance (today&apos;s existing default)</option>
              <option value="DAILY_CAMPUS">Daily/campus attendance only</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Controls what attendance percentage is printed on Marksheets/Report Cards and used by any
              &quot;Attendance&quot; mark component in an exam&apos;s mark composition. &quot;Subject-wise&quot; uses real
              per-subject attendance (once teachers are marking it per period); &quot;Daily/campus&quot; uses the same
              whole-day attendance class teachers mark once a day — the same figure for every subject.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1.5 pt-6">
            <Label>Student leave — who must approve?</Label>
            <select className="w-full rounded-md border px-3 py-2 text-sm" {...register("leave_approval_mode")}>
              <option value="CLASS_TEACHER_ONLY">Class (homeroom) Teacher only — one decision per request</option>
              <option value="ALL_SUBJECT_TEACHERS">Every subject teacher whose periods fall within the leave dates</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Decided once per request at submission time — changing this setting never reinterprets a request that
              is already pending. &quot;Class Teacher only&quot; is a single approve/reject decision; &quot;Every subject
              teacher&quot; requires each resolved teacher to approve before the request is fully approved, and any
              single rejection rejects the whole request.
            </p>
          </CardContent>
        </Card>
        <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Save Changes"}</Button>
      </form>
    </PageWrapper>
  );
}
