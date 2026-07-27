"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, CardHeader, CardTitle, Label, Switch, Button } from "@education-erp/ui";
import { marksheetDisplaySettingsSchema, type MarksheetDisplaySettingsInput } from "@education-erp/validators";
import { api } from "@/lib/api";

const GROUPS: { title: string; fields: { key: keyof MarksheetDisplaySettingsInput; label: string }[] }[] = [
  {
    title: "General",
    fields: [
      { key: "show_institute_banner", label: "Show institute banner (logo, name, watermark)" },
      { key: "show_qr_code", label: "Show QR code" },
      { key: "show_student_image", label: "Show student photo" },
      { key: "show_attendance_info", label: "Show attendance info" },
      { key: "show_general_ability_table", label: "Show general ability table (Punctuality/Discipline/Sports/Co-curricular)" },
      { key: "show_published_date", label: "Show published date" },
      { key: "show_mark_composition", label: "Show mark composition breakdown (Theory/MCQ/Practical/CT/Assignment/Attendance, when a subject uses it)" },
    ],
  },
  {
    title: "Per-subject columns",
    fields: [
      { key: "show_subject_full_marks", label: "Show full marks column" },
      { key: "show_subject_pass_marks", label: "Show pass marks column" },
    ],
  },
  {
    title: "Rank & highest marks",
    fields: [
      { key: "show_position_in_class", label: "Show position in class" },
      { key: "show_position_in_section", label: "Show position in section" },
      { key: "show_highest_in_class", label: "Show highest marks in class" },
      { key: "show_highest_in_section", label: "Show highest marks in section" },
    ],
  },
  {
    title: "Class averages",
    fields: [
      { key: "show_average_marks", label: "Show class average marks" },
      { key: "show_average_grade_point", label: "Show class average GPA" },
      { key: "show_average_percentage", label: "Show class average percentage" },
      { key: "show_average_position", label: "Show standing vs. class average (Above/At/Below)" },
      { key: "show_average_remarks", label: "Show class average remark (e.g. Excellent/Good, from the grading scale)" },
    ],
  },
];

export default function MarksheetDisplaySettingsPage() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["settings", "marksheet-display"],
    queryFn: async () => (await api.get("/api/settings/marksheet-display")).data.data,
  });

  const { watch, setValue, handleSubmit, reset, formState: { isSubmitting } } = useForm<MarksheetDisplaySettingsInput>({
    resolver: zodResolver(marksheetDisplaySettingsSchema),
  });

  useEffect(() => {
    if (data) reset(data);
  }, [data, reset]);

  const saveMutation = useMutation({
    mutationFn: (body: MarksheetDisplaySettingsInput) => api.put("/api/settings/marksheet-display", body),
    onSuccess: () => {
      toast.success("Marksheet display settings updated");
      queryClient.invalidateQueries({ queryKey: ["settings", "marksheet-display"] });
    },
    onError: () => toast.error("Failed to update settings"),
  });

  if (!data) return null;

  return (
    <PageWrapper>
      <PageHeader
        title="Marksheet Display Settings"
        subtitle="Control which blocks appear on generated Marksheets and Report Cards"
        breadcrumbs={[{ label: "Settings" }, { label: "Marksheet Display" }]}
      />
      <form onSubmit={handleSubmit((body) => saveMutation.mutate(body))} className="max-w-2xl space-y-6">
        {GROUPS.map((group) => (
          <Card key={group.title}>
            <CardHeader><CardTitle className="text-base">{group.title}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {group.fields.map((f) => (
                <div key={f.key} className="flex items-center justify-between">
                  <Label>{f.label}</Label>
                  <Switch checked={!!watch(f.key)} onCheckedChange={(v) => setValue(f.key, v)} />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
        <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Save Changes"}</Button>
      </form>
    </PageWrapper>
  );
}
