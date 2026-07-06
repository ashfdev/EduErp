"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { TeacherShell } from "@/components/teacher-shell";
import {
  PageWrapper,
  PageHeader,
  Card,
  CardContent,
  Button,
  Input,
  Label,
  Textarea,
  Switch,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  EmptyState,
  Badge,
} from "@education-erp/ui";
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
  class: { name_en: string };
  section: { name: string } | null;
  subject: { name_en: string } | null;
}

const RESOURCE_TYPES = [
  { value: "LECTURE_SLIDE", label: "Lecture Slide" },
  { value: "HANDOUT", label: "Handout" },
  { value: "ASSIGNMENT", label: "Assignment" },
  { value: "OTHER", label: "Other" },
];

function ResourcesContent() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const queryClient = useQueryClient();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [resourceType, setResourceType] = useState("OTHER");
  const [file, setFile] = useState<File | null>(null);

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
    queryKey: ["subjects", classId],
    queryFn: async () => (await api.get("/api/subjects", { params: { class_id: classId } })).data.data,
    enabled: !!classId,
  });

  const { data: resources } = useQuery<ResourceRow[]>({
    queryKey: ["resources"],
    queryFn: async () => (await api.get("/api/resources")).data.data,
  });

  function resetForm() {
    setClassId(""); setSectionId(""); setSubjectId(""); setTitle(""); setDescription(""); setResourceType("OTHER"); setFile(null);
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
      formData.append("file", file!);
      return api.post("/api/resources", formData, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: () => {
      toast.success("Resource published");
      queryClient.invalidateQueries({ queryKey: ["resources"] });
      setUploadOpen(false);
      resetForm();
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? "Failed to publish resource";
      toast.error(message);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_published }: { id: string; is_published: boolean }) => api.put(`/api/resources/${id}`, { is_published }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["resources"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/resources/${id}`),
    onSuccess: () => {
      toast.success("Resource removed");
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
        <PageHeader title="Teaching Resources" subtitle="Publish lecture slides, handouts, and assignments to your classes" />

        <div className="flex justify-end">
          <Button size="sm" onClick={() => setUploadOpen(true)}>+ Upload Resource</Button>
        </div>

        <Card>
          <CardContent className="pt-6">
            {!resources?.length && <EmptyState title="No resources published yet" />}
            <div className="space-y-2">
              {resources?.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                  <div>
                    <p className="font-medium">
                      {r.title} <Badge variant="outline">{RESOURCE_TYPES.find((t) => t.value === r.resource_type)?.label ?? r.resource_type}</Badge>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.class.name_en}{r.section ? ` · ${r.section.name}` : " · All sections"}{r.subject ? ` · ${r.subject.name_en}` : ""} · {r.original_filename}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Switch checked={r.is_published} onCheckedChange={(v) => toggleMutation.mutate({ id: r.id, is_published: v })} />
                      Published
                    </label>
                    <button onClick={() => download(r.id)} className="text-primary hover:underline">Download</button>
                    <button onClick={() => deleteMutation.mutate(r.id)} className="text-destructive hover:underline">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </PageWrapper>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Upload Resource</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Class</Label>
                <select className="w-full rounded-md border px-3 py-2 text-sm" value={classId} onChange={(e) => { setClassId(e.target.value); setSectionId(""); setSubjectId(""); }}>
                  <option value="">Select...</option>
                  {classOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Section</Label>
                <select className="w-full rounded-md border px-3 py-2 text-sm" value={sectionId} onChange={(e) => setSectionId(e.target.value)} disabled={!classId}>
                  <option value="">All sections</option>
                  {sectionOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Subject (optional)</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} disabled={!classId}>
                <option value="">None</option>
                {subjects?.map((s) => <option key={s.id} value={s.id}>{s.name_en}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={resourceType} onChange={(e) => setResourceType(e.target.value)}>
                {RESOURCE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Chapter 4 - Newton's Laws" /></div>
            <div className="space-y-1.5"><Label>Description (optional)</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></div>
            <div className="space-y-1.5"><Label>File</Label><Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
          </div>
          <DialogFooter>
            <Button onClick={() => uploadMutation.mutate()} disabled={uploadMutation.isPending || !classId || !title || !file}>
              {uploadMutation.isPending ? "Publishing..." : "Publish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TeacherShell>
  );
}

export default function TeacherResourcesPage() {
  return <ResourcesContent />;
}
