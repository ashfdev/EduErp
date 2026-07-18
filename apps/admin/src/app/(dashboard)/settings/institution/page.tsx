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
  Input,
  Label,
  Textarea,
  Button,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@education-erp/ui";
import { institutionProfileSchema, type InstitutionProfileInput } from "@education-erp/validators";
import { api } from "@/lib/api";

const INSTITUTION_TYPES = [
  { value: "SCHOOL", label: "School" },
  { value: "COLLEGE", label: "College" },
  { value: "UNIVERSITY", label: "University" },
  { value: "MADRASAH", label: "Madrasah" },
] as const;

// Mirrors server/api/src/modules/settings/institution.routes.ts's
// TYPE_CASCADE exactly — kept in sync manually since this is only a
// pre-commit preview, not the source of truth (the PUT /type call re-derives
// the real values server-side). Update both together if the cascade changes.
const TERMINOLOGY_PREVIEW: Record<string, { class: string; section: string; teacher: string; principal: string }> = {
  SCHOOL: { class: "Class", section: "Section", teacher: "Teacher", principal: "Headmaster" },
  COLLEGE: { class: "Class", section: "Section", teacher: "Teacher", principal: "Principal" },
  UNIVERSITY: { class: "Semester", section: "Batch", teacher: "Professor", principal: "Vice Chancellor" },
  MADRASAH: { class: "Class", section: "Section", teacher: "Ustaz", principal: "Muhtamim" },
};

export default function InstitutionSettingsPage() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["settings", "institution"],
    queryFn: async () => (await api.get("/api/settings/institution")).data.data,
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<InstitutionProfileInput>({
    resolver: zodResolver(institutionProfileSchema),
  });

  useEffect(() => {
    if (data) reset(data);
  }, [data, reset]);

  const saveMutation = useMutation({
    mutationFn: (body: InstitutionProfileInput) => api.put("/api/settings/institution", body),
    onSuccess: () => {
      toast.success("Institution profile updated");
      queryClient.invalidateQueries({ queryKey: ["settings", "institution"] });
    },
    onError: () => toast.error("Failed to update institution profile"),
  });

  const typeMutation = useMutation({
    mutationFn: (type: string) => api.put("/api/settings/institution/type", { type }),
    onSuccess: () => {
      toast.success("Institution type changed — terminology updated across the system");
      queryClient.invalidateQueries({ queryKey: ["settings", "institution"] });
      queryClient.invalidateQueries({ queryKey: ["settings", "config"] });
    },
    onError: () => toast.error("Failed to change institution type"),
  });

  const [pendingType, setPendingType] = useState<string | null>(null);

  async function uploadBrand(kind: "logo" | "favicon" | "student-login-bg" | "teacher-login-bg", file: File) {
    const form = new FormData();
    form.append("file", file);
    try {
      await api.post(`/api/settings/institution/${kind}`, form, { headers: { "Content-Type": "multipart/form-data" } });
      const label = kind === "logo" ? "Logo" : kind === "favicon" ? "Favicon" : kind === "student-login-bg" ? "Student Login Background" : "Teacher Login Background";
      toast.success(`${label} uploaded`);
      queryClient.invalidateQueries({ queryKey: ["settings", "institution"] });
    } catch {
      toast.error(`Failed to upload ${kind}`);
    }
  }

  const currentType = watch("type") ?? data?.type;

  return (
    <PageWrapper>
      <PageHeader title="Institution Profile" subtitle="Branding, contact info, and about content" breadcrumbs={[{ label: "Settings" }, { label: "Institution" }]} />

      <form onSubmit={handleSubmit((body) => saveMutation.mutate(body))} className="space-y-6">
        <Tabs defaultValue="basic">
          <TabsList>
            <TabsTrigger value="basic">Basic Info</TabsTrigger>
            <TabsTrigger value="branding">Branding</TabsTrigger>
            <TabsTrigger value="contact">Contact & Links</TabsTrigger>
            <TabsTrigger value="about">About Content</TabsTrigger>
          </TabsList>

          <TabsContent value="basic">
            <Card>
              <CardContent className="space-y-4 pt-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Institution Name (English)</Label>
                    <Input {...register("name_en")} />
                    {errors.name_en && <p className="text-xs text-destructive">{errors.name_en.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Institution Name (Bangla)</Label>
                    <Input {...register("name_bn")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tagline (English)</Label>
                    <Input {...register("tagline_en")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tagline (Bangla)</Label>
                    <Input {...register("tagline_bn")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>EIIN</Label>
                    <Input {...register("eiin")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Board</Label>
                    <Input {...register("board")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Founded Year</Label>
                    <Input type="number" {...register("founded_year", { valueAsNumber: true })} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Institution Type</Label>
                  <div className="grid grid-cols-4 gap-3">
                    {INSTITUTION_TYPES.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setPendingType(t.value)}
                        className={`rounded-md border p-4 text-sm font-medium transition-colors ${
                          currentType === t.value ? "border-primary bg-primary/5" : "hover:bg-accent"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  {pendingType && pendingType !== currentType && (
                    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
                      <p>
                        Changing to <strong>{pendingType}</strong> will update terminology across the system:
                      </p>
                      <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                        <li>&quot;Class&quot; → &quot;{TERMINOLOGY_PREVIEW[pendingType]?.class}&quot;</li>
                        <li>&quot;Section&quot; → &quot;{TERMINOLOGY_PREVIEW[pendingType]?.section}&quot;</li>
                        <li>&quot;Teacher&quot; → &quot;{TERMINOLOGY_PREVIEW[pendingType]?.teacher}&quot;</li>
                        <li>&quot;Principal&quot; → &quot;{TERMINOLOGY_PREVIEW[pendingType]?.principal}&quot;</li>
                      </ul>
                      <p className="mt-2">This also switches shift/semester structure and department visibility to match, and cannot be easily undone.</p>
                      <div className="mt-2 flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            typeMutation.mutate(pendingType);
                            setPendingType(null);
                          }}
                        >
                          Confirm change
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => setPendingType(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="branding">
            <Card>
              <CardContent className="space-y-4 pt-6">
                <div className="flex flex-wrap gap-8">
                  <div className="space-y-2">
                    <Label>Logo</Label>
                    {data?.logo_url && <img src={data.logo_url} alt="Logo" className="h-16 rounded border object-contain p-1" />}
                    <Input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadBrand("logo", e.target.files[0])} />
                  </div>
                  <div className="space-y-2">
                    <Label>Favicon</Label>
                    {data?.favicon_url && <img src={data.favicon_url} alt="Favicon" className="h-16 w-16 rounded border object-contain p-1" />}
                    <Input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadBrand("favicon", e.target.files[0])} />
                  </div>
                  <div className="space-y-2">
                    <Label>Student Portal Login Background</Label>
                    {data?.student_login_bg_url && <img src={data.student_login_bg_url} alt="Student BG" className="h-16 rounded border object-contain p-1" />}
                    <Input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadBrand("student-login-bg", e.target.files[0])} />
                  </div>
                  <div className="space-y-2">
                    <Label>Teacher Portal Login Background</Label>
                    {data?.teacher_login_bg_url && <img src={data.teacher_login_bg_url} alt="Teacher BG" className="h-16 rounded border object-contain p-1" />}
                    <Input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadBrand("teacher-login-bg", e.target.files[0])} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Primary Color</Label>
                    <Input type="color" {...register("primary_color")} className="h-10 w-24 p-1" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Secondary Color</Label>
                    <Input type="color" {...register("secondary_color")} className="h-10 w-24 p-1" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="contact">
            <Card>
              <CardContent className="grid grid-cols-2 gap-4 pt-6">
                <div className="space-y-1.5">
                  <Label>Phone (Primary)</Label>
                  <Input {...register("phone_primary")} />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone (Secondary)</Label>
                  <Input {...register("phone_secondary")} />
                </div>
                <div className="space-y-1.5">
                  <Label>Email (Primary)</Label>
                  <Input {...register("email_primary")} />
                </div>
                <div className="space-y-1.5">
                  <Label>Email (Secondary)</Label>
                  <Input {...register("email_secondary")} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Address</Label>
                  <Input {...register("address")} />
                </div>
                <div className="space-y-1.5">
                  <Label>District</Label>
                  <Input {...register("district")} />
                </div>
                <div className="space-y-1.5">
                  <Label>Division</Label>
                  <Input {...register("division")} />
                </div>
                <div className="space-y-1.5">
                  <Label>Post Code</Label>
                  <Input {...register("post_code")} />
                </div>
                <div className="space-y-1.5">
                  <Label>Website URL</Label>
                  <Input {...register("website_url")} />
                </div>
                <div className="space-y-1.5">
                  <Label>Facebook URL</Label>
                  <Input {...register("facebook_url")} />
                </div>
                <div className="space-y-1.5">
                  <Label>YouTube URL</Label>
                  <Input {...register("youtube_url")} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Map Embed Code</Label>
                  <Textarea {...register("map_embed_code")} rows={3} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="about">
            <Card>
              <CardContent className="space-y-4 pt-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Principal Name</Label>
                    <Input {...register("principal_name")} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Principal Designation</Label>
                    <Input {...register("principal_designation")} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Established / About</Label>
                  <Textarea {...register("established_text")} rows={4} />
                </div>
                <div className="space-y-1.5">
                  <Label>Mission</Label>
                  <Textarea {...register("mission_text")} rows={4} />
                </div>
                <div className="space-y-1.5">
                  <Label>Vision</Label>
                  <Textarea {...register("vision_text")} rows={4} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving..." : "Save Changes"}
        </Button>
      </form>
    </PageWrapper>
  );
}
