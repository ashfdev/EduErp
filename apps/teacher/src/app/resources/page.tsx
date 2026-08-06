"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { TeacherShell } from "@/components/teacher-shell";
import { Badge, Button, Card, CardContent, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, EmptyState, Input, Label, PageHeader, PageWrapper, Switch, Textarea, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";

interface MySection {
  class_id: string;
  class_name: string;
  section_id: string;
  section_name: string;
}
interface ClassOption {
  id: string;
  name_en: string;
  sections: { id: string; name: string }[];
}
interface Subject {
  id: string;
  name_en: string;
}
interface ResourceRow {
  id: string;
  title: string;
  description: string | null;
  resource_type: string;
  original_filename: string;
  is_published: boolean;
  created_at: string;
  due_date: string | null;
  class: { name_en: string };
  section: { name: string } | null;
  subject: { name_en: string } | null;
}
interface Submission {
  id: string;
  original_filename: string;
  status: string;
  grade: number | null;
  feedback: string | null;
  student: { name_en: string; student_uid: string };
}

const RESOURCE_TYPE_KEYS = [
  { value: "LECTURE_SLIDE", key: "typeLectureSlide" },
  { value: "HANDOUT", key: "typeHandout" },
  { value: "ASSIGNMENT", key: "typeAssignment" },
  { value: "OTHER", key: "typeOther" },
] as const;

function ResourcesContent() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const queryClient = useQueryClient();
  const t = useTranslations("resources");
  const tCommon = useTranslations("common");

  const [uploadOpen, setUploadOpen] = useState(false);
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [resourceType, setResourceType] = useState("OTHER");
  const [dueDate, setDueDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submissionsResourceId, setSubmissionsResourceId] = useState<string | null>(null);

  // Admin can target any class/section; a teacher can only pick from
  // classes/sections they're actually assigned to (server-enforced too).
  const { data: mySections } = useQuery<MySection[]>({
    queryKey: ["teacher", "my-sections"],
    queryFn: async () => (await api.get("/api/teacher/my-sections")).data.data,
    enabled: !isAdmin,
  });
  const { data: allClasses } = useQuery<ClassOption[]>({
    queryKey: ["settings", "classes"],
    queryFn: async () => (await api.get("/api/settings/classes")).data.data,
    enabled: isAdmin,
  });

  const classOptions = isAdmin
    ? (allClasses ?? []).map((c) => ({ id: c.id, name: c.name_en }))
    : [...new Map((mySections ?? []).map((s) => [s.class_id, { id: s.class_id, name: s.class_name }])).values()];
  const sectionOptions = isAdmin
    ? (allClasses ?? []).find((c) => c.id === classId)?.sections.map((s) => ({ id: s.id, name: s.name })) ?? []
    : (mySections ?? []).filter((s) => s.class_id === classId).map((s) => ({ id: s.section_id, name: s.section_name }));

  const { data: subjects } = useQuery<Subject[]>({
    queryKey: ["subjects", classId, isAdmin],
    // Non-admin teachers only get offered subjects they're actually
    // assigned to (assigned_only=true) — admin keeps seeing every subject
    // in the class, unfiltered, exactly as before.
    queryFn: async () =>
      (await api.get("/api/subjects", { params: { class_id: classId, ...(isAdmin ? {} : { assigned_only: true }) } })).data.data,
    enabled: !!classId,
  });

  const { data: resources } = useQuery<ResourceRow[]>({
    queryKey: ["resources"],
    queryFn: async () => (await api.get("/api/resources")).data.data,
  });

  function resetForm() {
    setClassId(""); setSectionId(""); setSubjectId(""); setTitle(""); setDescription(""); setResourceType("OTHER"); setDueDate(""); setFile(null);
  }

  const uploadMutation = useMutation({
    mutationFn: () => {
      const formData = new FormData();
      formData.append("class_id", classId);
      if (sectionId) formData.append("section_id", sectionId);
      if (subjectId) formData.append("subject_id", subjectId);
      formData.append("title", title);
      if (description) formData.append("description", description);
      formData.append("resource_type", resourceType);
      if (resourceType === "ASSIGNMENT" && dueDate) formData.append("due_date", dueDate);
      formData.append("file", file!);
      return api.post("/api/resources", formData, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: () => {
      toast.success(t("resourcePublished"));
      queryClient.invalidateQueries({ queryKey: ["resources"] });
      setUploadOpen(false);
      resetForm();
    },
    onError: (err: unknown) => {
      const message = extractErrorMessage(err) ?? t("resourcePublishFailed");
      toast.error(message);
    },
  });

  const { data: submissions } = useQuery<Submission[]>({
    queryKey: ["resources", submissionsResourceId, "submissions"],
    queryFn: async () => (await api.get(`/api/resources/${submissionsResourceId}/submissions`)).data.data,
    enabled: !!submissionsResourceId,
  });

  const [gradeDrafts, setGradeDrafts] = useState<Record<string, { grade?: number; feedback?: string }>>({});
  const gradeMutation = useMutation({
    mutationFn: ({ submissionId, data }: { submissionId: string; data: { grade: number; feedback?: string } }) =>
      api.put(`/api/resources/submissions/${submissionId}/grade`, data),
    onSuccess: () => {
      toast.success(t("gradeSaved"));
      queryClient.invalidateQueries({ queryKey: ["resources", submissionsResourceId, "submissions"] });
    },
  });

  async function downloadSubmission(id: string) {
    const res = await api.get(`/api/resources/submissions/${id}/download`);
    window.open(res.data.data.url, "_blank");
  }

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_published }: { id: string; is_published: boolean }) => api.put(`/api/resources/${id}`, { is_published }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["resources"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/resources/${id}`),
    onSuccess: () => {
      toast.success(t("resourceRemoved"));
      queryClient.invalidateQueries({ queryKey: ["resources"] });
    },
  });

  async function download(id: string) {
    const res = await api.get(`/api/resources/${id}/download`);
    window.open(res.data.data.url, "_blank");
  }

  return (
    <TeacherShell>
      <PageWrapper className="p-0">
        <PageHeader title={t("title")} subtitle={t("subtitle")} />

        <div className="flex justify-end">
          <Button size="sm" onClick={() => setUploadOpen(true)}>{t("uploadResource")}</Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            {!resources?.length && <EmptyState title={t("noResources")} />}
            <div className="space-y-2">
              {resources?.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                  <div>
                    <p className="font-medium">
                      {r.title} <Badge variant="outline">{t(RESOURCE_TYPE_KEYS.find((rt) => rt.value === r.resource_type)?.key ?? "typeOther")}</Badge>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.class.name_en}{r.section ? ` · ${r.section.name}` : ` ${t("allSections")}`}{r.subject ? ` · ${r.subject.name_en}` : ""} · {r.original_filename}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Switch checked={r.is_published} onCheckedChange={(v) => toggleMutation.mutate({ id: r.id, is_published: v })} />
                      {t("publishedLabel")}
                    </label>
                    {r.resource_type === "ASSIGNMENT" && (
                      <button onClick={() => setSubmissionsResourceId(r.id)} className="text-primary hover:underline">{t("submissions")}</button>
                    )}
                    <button onClick={() => download(r.id)} className="text-primary hover:underline">{t("download")}</button>
                    <button onClick={() => deleteMutation.mutate(r.id)} className="text-destructive hover:underline">{t("delete")}</button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </PageWrapper>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t("uploadResourceTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("class")}</Label>
                <select className="w-full rounded-md border px-3 py-2 text-sm" value={classId} onChange={(e) => { setClassId(e.target.value); setSectionId(""); setSubjectId(""); }}>
                  <option value="">{t("select")}</option>
                  {classOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("section")}</Label>
                <select className="w-full rounded-md border px-3 py-2 text-sm" value={sectionId} onChange={(e) => setSectionId(e.target.value)} disabled={!classId}>
                  <option value="">{t("sectionAll")}</option>
                  {sectionOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("subjectOptional")}</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} disabled={!classId}>
                <option value="">{t("none")}</option>
                {subjects?.map((s) => <option key={s.id} value={s.id}>{s.name_en}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("type")}</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={resourceType} onChange={(e) => setResourceType(e.target.value)}>
                {RESOURCE_TYPE_KEYS.map((rt) => <option key={rt.value} value={rt.value}>{t(rt.key)}</option>)}
              </select>
            </div>
            {resourceType === "ASSIGNMENT" && (
              <div className="space-y-1.5"><Label>{t("dueDateOptional")}</Label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
            )}
            <div className="space-y-1.5"><Label>{t("titleLabel")}</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("titlePlaceholder")} /></div>
            <div className="space-y-1.5"><Label>{t("descriptionOptional")}</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></div>
            <div className="space-y-1.5"><Label>{t("file")}</Label><Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
          </div>
          <DialogFooter>
            <Button onClick={() => uploadMutation.mutate()} disabled={uploadMutation.isPending || !classId || !title || !file}>
              {uploadMutation.isPending ? t("publishing") : t("publish")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!submissionsResourceId} onOpenChange={(o) => !o && setSubmissionsResourceId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{t("submissionsTitle")}</DialogTitle></DialogHeader>
          {!submissions?.length && <p className="text-sm text-muted-foreground">{t("noSubmissions")}</p>}
          <div className="space-y-2">
            {submissions?.map((s) => {
              const draft = gradeDrafts[s.id] ?? {};
              return (
                <div key={s.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{s.student.name_en} <span className="font-mono text-xs text-muted-foreground">{s.student.student_uid}</span></p>
                    <Badge variant={s.status === "GRADED" ? "default" : "outline"}>{s.status}</Badge>
                  </div>
                  <button onClick={() => downloadSubmission(s.id)} className="text-xs text-primary hover:underline">{t("downloadFile", { filename: s.original_filename })}</button>
                  <div className="mt-2 flex items-center gap-2">
                    <Input
                      type="number"
                      placeholder={t("gradePlaceholder")}
                      className="h-8 w-20"
                      value={draft.grade ?? s.grade ?? ""}
                      onChange={(e) => setGradeDrafts((prev) => ({ ...prev, [s.id]: { ...prev[s.id], grade: Number(e.target.value) } }))}
                    />
                    <Input
                      placeholder={t("feedbackPlaceholder")}
                      className="h-8 flex-1"
                      value={draft.feedback ?? s.feedback ?? ""}
                      onChange={(e) => setGradeDrafts((prev) => ({ ...prev, [s.id]: { ...prev[s.id], feedback: e.target.value } }))}
                    />
                    <Button
                      size="sm"
                      onClick={() => gradeMutation.mutate({ submissionId: s.id, data: { grade: draft.grade ?? s.grade ?? 0, feedback: draft.feedback ?? s.feedback ?? undefined } })}
                      disabled={gradeMutation.isPending}
                    >
                      {tCommon("save")}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmissionsResourceId(null)}>{t("close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TeacherShell>
  );
}

export default function TeacherResourcesPage() {
  return <ResourcesContent />;
}
