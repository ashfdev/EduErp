"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper,
  PageHeader,
  Card,
  CardContent,
  Button,
  Input,
  Label,
  Switch,
  Badge,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  ConfirmDialog,
  extractErrorMessage,
} from "@education-erp/ui";
import { api } from "@/lib/api";
import { useInstitution } from "@/hooks/use-institution";

const STEPS = ["Personal", "Guardian", "Academic Placement", "Subjects", "Documents", "Review"];

interface ClassOption {
  id: string;
  name_en: string;
  sections: { id: string; name: string; shift: { id: string; name: string } | null }[];
  groups: { id: string; name_en: string }[];
}

interface SubjectOption {
  id: string;
  name_en: string;
  is_compulsory: boolean;
  is_optional: boolean;
}

const RELIGIONS = ["Islam", "Hinduism", "Christianity", "Buddhism", "Other"];
const NATIONALITIES = ["Bangladeshi", "Indian", "Other"];
const DOC_TYPES = ["BIRTH_CERTIFICATE", "TRANSFER_CERTIFICATE", "TESTIMONIAL", "ACADEMIC_CERTIFICATE", "MARKSHEET", "FATHER_NID", "MOTHER_NID", "OTHER"] as const;

const emptyForm = {
  name_en: "",
  name_bn: "",
  middle_name: "",
  nick_name: "",
  gender: "MALE" as "MALE" | "FEMALE" | "OTHER",
  date_of_birth: "",
  religion: "",
  nationality: "Bangladeshi",
  blood_group: "",
  phone: "",
  other_phone: "",
  passport_no: "",
  address_current: "",
  address_permanent: "",
  present_house_name: "",
  present_village: "",
  present_post_code: "",
  present_district: "",
  present_division: "",
  permanent_house_name: "",
  permanent_village: "",
  permanent_post_code: "",
  permanent_district: "",
  permanent_division: "",
  has_disability: false,
  disability_note: "",
  father_name: "",
  father_phone: "",
  father_nid: "",
  father_occupation: "",
  mother_name: "",
  mother_phone: "",
  mother_nid: "",
  mother_occupation: "",
  academic_year_id: "",
  current_class_id: "",
  current_section_id: "",
  group_id: "",
  current_roll_no: "",
  registration_no: "",
  board_roll: "",
  admission_date: new Date().toISOString().slice(0, 10),
  previous_institution: "",
  previous_class: "",
  previous_result: "",
  send_portal_login_sms: true,
};

interface StagedDoc {
  file: File;
  doc_type: (typeof DOC_TYPES)[number];
}

export default function NewStudentPage() {
  const router = useRouter();
  const { terms } = useInstitution();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [selectedOptional, setSelectedOptional] = useState<string[]>([]);
  const [capacityMessage, setCapacityMessage] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [stagedDocs, setStagedDocs] = useState<StagedDoc[]>([]);
  const [newDocType, setNewDocType] = useState<(typeof DOC_TYPES)[number]>("BIRTH_CERTIFICATE");
  const [newDocFile, setNewDocFile] = useState<File | null>(null);

  const { data: years } = useQuery<{ id: string; label: string; is_active: boolean }[]>({
    queryKey: ["settings", "academic-years"],
    queryFn: async () => (await api.get("/api/settings/academic-years")).data.data,
  });
  // Scoped to the selected year — Class rows are recreated every academic
  // year, so an unscoped list would let an admin pick a stale prior-year
  // Class row here while academic_year_id points at a different year.
  const { data: classes } = useQuery<ClassOption[]>({
    queryKey: ["settings", "classes", form.academic_year_id],
    queryFn: async () => (await api.get("/api/settings/classes", { params: { academic_year_id: form.academic_year_id } })).data.data,
    enabled: !!form.academic_year_id,
  });

  const selectedClass = classes?.find((c) => c.id === form.current_class_id);

  const { data: subjects } = useQuery<SubjectOption[]>({
    queryKey: ["subjects", form.current_class_id],
    queryFn: async () => (await api.get("/api/subjects", { params: { class_id: form.current_class_id } })).data.data,
    enabled: !!form.current_class_id,
  });

  const compulsory = subjects?.filter((s) => s.is_compulsory) ?? [];
  const optional = subjects?.filter((s) => s.is_optional) ?? [];

  async function handlePhotoSelect(file: File | null) {
    if (!file) return;
    setPhotoUploading(true);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await api.post("/api/students/photo", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setPhotoUrl(res.data.data.photo_url);
    } catch (err) {
      toast.error(extractErrorMessage(err) ?? "Failed to upload photo");
    } finally {
      setPhotoUploading(false);
    }
  }

  function addStagedDoc() {
    if (!newDocFile) return;
    setStagedDocs((prev) => [...prev, { file: newDocFile, doc_type: newDocType }]);
    setNewDocFile(null);
  }

  const createMutation = useMutation({
    mutationFn: (override?: boolean) =>
      api.post("/api/students", {
        ...form,
        date_of_birth: form.date_of_birth || undefined,
        group_id: form.group_id || undefined,
        photo_url: photoUrl,
        selected_optional_subject_ids: selectedOptional,
        override,
      }),
    onSuccess: async (res) => {
      const studentId = res.data.data.id as string;
      let failedCount = 0;
      for (const doc of stagedDocs) {
        try {
          const fd = new FormData();
          fd.append("file", doc.file);
          fd.append("doc_type", doc.doc_type);
          await api.post(`/api/students/${studentId}/documents`, fd, { headers: { "Content-Type": "multipart/form-data" } });
        } catch {
          failedCount++;
        }
      }
      if (failedCount > 0) {
        toast(`${failedCount} document(s) failed to upload — add them manually from the Documents tab.`);
      }
      toast.success(`Student created — ID: ${res.data.data.student_uid}`);
      router.push(`/students/${studentId}`);
    },
    onError: (err: unknown) => {
      const error = (err as { response?: { data?: { error?: { code?: string; message?: string } } } })?.response?.data?.error;
      if (error?.code === "SECTION_AT_CAPACITY") {
        setCapacityMessage(error.message ?? "This section is at or over capacity.");
        return;
      }
      toast.error(error?.message ?? "Failed to create student — check required fields");
    },
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function copyPresentToPermanent() {
    setForm((f) => ({
      ...f,
      address_permanent: f.address_current,
      permanent_house_name: f.present_house_name,
      permanent_village: f.present_village,
      permanent_post_code: f.present_post_code,
      permanent_district: f.present_district,
      permanent_division: f.present_division,
    }));
  }

  const presentAddressComplete = !!(form.present_house_name && form.present_village && form.present_post_code && form.present_district && form.present_division);
  const permanentAddressComplete = !!(form.permanent_house_name && form.permanent_village && form.permanent_post_code && form.permanent_district && form.permanent_division);
  const guardianComplete = !!(
    form.father_name && form.father_phone && form.father_nid && form.father_occupation &&
    form.mother_name && form.mother_phone && form.mother_nid && form.mother_occupation
  );

  const canProceed =
    (step === 0 && form.name_en && form.gender && !!photoUrl && presentAddressComplete && permanentAddressComplete) ||
    (step === 1 && guardianComplete) ||
    (step === 2 && form.academic_year_id && form.current_class_id && (!selectedClass?.groups.length || form.group_id)) ||
    step === 3 ||
    step === 4 ||
    step === 5;

  return (
    <PageWrapper>
      <PageHeader title="Add Student" breadcrumbs={[{ label: "Students", href: "/students" }, { label: "Add" }]} />

      <div className="flex gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className={`flex-1 rounded-md border-b-2 pb-2 text-center text-sm ${i === step ? "border-primary font-medium" : "border-transparent text-muted-foreground"}`}>
            {i + 1}. {label}
          </div>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          {step === 0 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Student Photo *</Label>
                <div className="flex items-center gap-3">
                  {photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoUrl} alt="Student photo" className="h-16 w-16 rounded-full object-cover border" />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-full border bg-muted text-xs text-muted-foreground">No photo</div>
                  )}
                  <Input type="file" accept="image/*" onChange={(e) => handlePhotoSelect(e.target.files?.[0] ?? null)} disabled={photoUploading} className="max-w-xs" />
                  {photoUploading && <span className="text-xs text-muted-foreground">Uploading...</span>}
                </div>
                <p className="text-xs text-muted-foreground">A photo is required before continuing.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label>Name (English) *</Label><Input value={form.name_en} onChange={(e) => set("name_en", e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Name (Bangla)</Label><Input value={form.name_bn} onChange={(e) => set("name_bn", e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Middle Name</Label><Input value={form.middle_name} onChange={(e) => set("middle_name", e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Nick Name</Label><Input value={form.nick_name} onChange={(e) => set("nick_name", e.target.value)} /></div>
                <div className="space-y-1.5">
                  <Label>Gender *</Label>
                  <Select value={form.gender} onValueChange={(v) => set("gender", v as typeof form.gender)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MALE">Male</SelectItem>
                      <SelectItem value="FEMALE">Female</SelectItem>
                      <SelectItem value="OTHER">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Date of Birth</Label><Input type="date" value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} /></div>
                <div className="space-y-1.5">
                  <Label>Religion</Label>
                  <Select value={form.religion} onValueChange={(v) => set("religion", v)}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      {RELIGIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Nationality</Label>
                  <Select value={form.nationality} onValueChange={(v) => set("nationality", v)}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      {NATIONALITIES.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Blood Group</Label><Input value={form.blood_group} onChange={(e) => set("blood_group", e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Student Phone (optional)</Label><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Other Phone</Label><Input value={form.other_phone} onChange={(e) => set("other_phone", e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Passport No</Label><Input value={form.passport_no} onChange={(e) => set("passport_no", e.target.value)} /></div>
              </div>

              <div className="rounded-md border p-3 space-y-3">
                <p className="text-sm font-medium">Present Address *</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5"><Label>House Name *</Label><Input value={form.present_house_name} onChange={(e) => set("present_house_name", e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Village *</Label><Input value={form.present_village} onChange={(e) => set("present_village", e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Post Code *</Label><Input value={form.present_post_code} onChange={(e) => set("present_post_code", e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>District *</Label><Input value={form.present_district} onChange={(e) => set("present_district", e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Division *</Label><Input value={form.present_division} onChange={(e) => set("present_division", e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Road / Area (optional)</Label><Input value={form.address_current} onChange={(e) => set("address_current", e.target.value)} /></div>
                </div>
              </div>

              <div className="rounded-md border p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Permanent Address *</p>
                  <button type="button" className="text-xs text-primary hover:underline" onClick={copyPresentToPermanent}>
                    Same as Present Address
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5"><Label>House Name *</Label><Input value={form.permanent_house_name} onChange={(e) => set("permanent_house_name", e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Village *</Label><Input value={form.permanent_village} onChange={(e) => set("permanent_village", e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Post Code *</Label><Input value={form.permanent_post_code} onChange={(e) => set("permanent_post_code", e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>District *</Label><Input value={form.permanent_district} onChange={(e) => set("permanent_district", e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Division *</Label><Input value={form.permanent_division} onChange={(e) => set("permanent_division", e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>Road / Area (optional)</Label><Input value={form.address_permanent} onChange={(e) => set("address_permanent", e.target.value)} /></div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Label>Has disability</Label>
                <Switch checked={form.has_disability} onCheckedChange={(v) => set("has_disability", v)} />
              </div>
              {form.has_disability && (
                <div className="space-y-1.5"><Label>Disability Note</Label><Input value={form.disability_note} onChange={(e) => set("disability_note", e.target.value)} /></div>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Father&apos;s Name *</Label><Input value={form.father_name} onChange={(e) => set("father_name", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Father&apos;s Phone *</Label><Input value={form.father_phone} onChange={(e) => set("father_phone", e.target.value)} placeholder="01XXXXXXXXX" /></div>
              <div className="space-y-1.5"><Label>Father&apos;s NID *</Label><Input value={form.father_nid} onChange={(e) => set("father_nid", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Father&apos;s Occupation *</Label><Input value={form.father_occupation} onChange={(e) => set("father_occupation", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Mother&apos;s Name *</Label><Input value={form.mother_name} onChange={(e) => set("mother_name", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Mother&apos;s Phone *</Label><Input value={form.mother_phone} onChange={(e) => set("mother_phone", e.target.value)} placeholder="01XXXXXXXXX" /></div>
              <div className="space-y-1.5"><Label>Mother&apos;s NID *</Label><Input value={form.mother_nid} onChange={(e) => set("mother_nid", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Mother&apos;s Occupation *</Label><Input value={form.mother_occupation} onChange={(e) => set("mother_occupation", e.target.value)} /></div>
            </div>
          )}

          {step === 2 && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Academic Year *</Label>
                <Select
                  value={form.academic_year_id}
                  onValueChange={(v) => {
                    set("academic_year_id", v);
                    set("current_class_id", "");
                    set("current_section_id", "");
                    set("group_id", "");
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    {years?.map((y) => <SelectItem key={y.id} value={y.id}>{y.label}{y.is_active ? " (Active)" : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{terms.term_class} *</Label>
                <Select
                  value={form.current_class_id}
                  onValueChange={(v) => { set("current_class_id", v); set("current_section_id", ""); set("group_id", ""); }}
                  disabled={!form.academic_year_id}
                >
                  <SelectTrigger><SelectValue placeholder={form.academic_year_id ? "Select..." : "Select an academic year first"} /></SelectTrigger>
                  <SelectContent>
                    {classes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name_en}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{terms.term_section}</Label>
                <Select value={form.current_section_id} onValueChange={(v) => set("current_section_id", v)}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    {selectedClass?.sections.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}{terms.has_shifts ? ` — ${s.shift ? s.shift.name : "no shift set"}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!!selectedClass?.groups.length && (
                <div className="space-y-1.5">
                  <Label>Group / Stream *</Label>
                  <Select value={form.group_id} onValueChange={(v) => set("group_id", v)}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      {selectedClass.groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name_en}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5"><Label>{terms.term_roll}</Label><Input value={form.current_roll_no} onChange={(e) => set("current_roll_no", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>{terms.term_registration}</Label><Input value={form.registration_no} onChange={(e) => set("registration_no", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Admission Date</Label><Input type="date" value={form.admission_date} onChange={(e) => set("admission_date", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Previous Institution</Label><Input value={form.previous_institution} onChange={(e) => set("previous_institution", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Previous Result</Label><Input value={form.previous_result} onChange={(e) => set("previous_result", e.target.value)} /></div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-medium">Compulsory subjects (auto-assigned)</p>
                <div className="flex flex-wrap gap-2">
                  {compulsory.length ? compulsory.map((s) => <Badge key={s.id} variant="success">{s.name_en}</Badge>) : <p className="text-sm text-muted-foreground">No compulsory subjects configured for this class yet.</p>}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">Optional subjects — select which to assign</p>
                <div className="flex flex-wrap gap-2">
                  {optional.length ? optional.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedOptional((prev) => (prev.includes(s.id) ? prev.filter((id) => id !== s.id) : [...prev, s.id]))}
                      className={`rounded-full border px-3 py-1 text-sm ${selectedOptional.includes(s.id) ? "border-primary bg-primary/10" : ""}`}
                    >
                      {s.name_en}
                    </button>
                  )) : <p className="text-sm text-muted-foreground">No optional subjects configured for this class.</p>}
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Optional — you can also add documents later from this student&apos;s profile.</p>
              <div className="space-y-2">
                {stagedDocs.map((d, i) => (
                  <div key={i} className="flex items-center justify-between rounded-md border p-2 text-sm">
                    <span><Badge variant="outline">{d.doc_type.replace(/_/g, " ")}</Badge> {d.file.name}</span>
                    <Button size="sm" variant="outline" onClick={() => setStagedDocs((prev) => prev.filter((_, idx) => idx !== i))}>Remove</Button>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3 items-end rounded-md border p-3">
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <select className="w-full rounded-md border px-3 py-2 text-sm" value={newDocType} onChange={(e) => setNewDocType(e.target.value as (typeof DOC_TYPES)[number])}>
                    {DOC_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5"><Label>File</Label><Input type="file" onChange={(e) => setNewDocFile(e.target.files?.[0] ?? null)} /></div>
                <Button type="button" variant="outline" disabled={!newDocFile} onClick={addStagedDoc}>+ Add</Button>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                {photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoUrl} alt="Student photo" className="h-20 w-20 rounded-full object-cover border" />
                )}
                <div>
                  <p className="text-base font-semibold">{form.name_en}{form.name_bn ? ` (${form.name_bn})` : ""}</p>
                  <p className="text-sm text-muted-foreground">{form.gender} · DOB {form.date_of_birth || "—"} · {form.religion || "—"} · {form.nationality}</p>
                  <p className="text-sm text-muted-foreground">{classes?.find((c) => c.id === form.current_class_id)?.name_en} {form.current_section_id ? `— ${selectedClass?.sections.find((s) => s.id === form.current_section_id)?.name}` : ""}</p>
                </div>
              </div>

              <div className="rounded-md border p-3">
                <p className="mb-2 text-sm font-medium">Contact</p>
                <p className="text-sm text-muted-foreground">Phone: {form.phone || "—"} · Other: {form.other_phone || "—"} · Passport: {form.passport_no || "—"}</p>
              </div>

              <div className="rounded-md border p-3">
                <p className="mb-2 text-sm font-medium">Present Address</p>
                <p className="text-sm text-muted-foreground">
                  {[form.present_house_name, form.present_village, form.address_current, form.present_post_code, form.present_district, form.present_division].filter(Boolean).join(", ")}
                </p>
              </div>
              <div className="rounded-md border p-3">
                <p className="mb-2 text-sm font-medium">Permanent Address</p>
                <p className="text-sm text-muted-foreground">
                  {[form.permanent_house_name, form.permanent_village, form.address_permanent, form.permanent_post_code, form.permanent_district, form.permanent_division].filter(Boolean).join(", ")}
                </p>
              </div>

              <div className="rounded-md border p-3">
                <p className="mb-2 text-sm font-medium">Guardian</p>
                <p className="text-sm text-muted-foreground">Father: {form.father_name} · {form.father_phone} · NID {form.father_nid} · {form.father_occupation}</p>
                <p className="text-sm text-muted-foreground">Mother: {form.mother_name} · {form.mother_phone} · NID {form.mother_nid} · {form.mother_occupation}</p>
              </div>

              <div className="rounded-md border p-3">
                <p className="mb-2 text-sm font-medium">Academic Placement</p>
                <p className="text-sm text-muted-foreground">
                  Roll: {form.current_roll_no || "—"} · Registration: {form.registration_no || "—"} · Admission: {form.admission_date}
                </p>
                <p className="text-sm text-muted-foreground">Subjects: {compulsory.length} compulsory + {selectedOptional.length} optional</p>
              </div>

              <div className="rounded-md border p-3">
                <p className="mb-2 text-sm font-medium">Documents staged</p>
                {stagedDocs.length ? (
                  <ul className="list-disc pl-5 text-sm text-muted-foreground">
                    {stagedDocs.map((d, i) => <li key={i}>{d.doc_type.replace(/_/g, " ")} — {d.file.name}</li>)}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">None — can be added later from the profile.</p>
                )}
              </div>

              <div className="flex items-center justify-between">
                <Label>Send portal login via SMS</Label>
                <Switch checked={form.send_portal_login_sms} onCheckedChange={(v) => set("send_portal_login_sms", v)} />
              </div>
            </div>
          )}

          <div className="flex justify-between pt-4">
            <Button type="button" variant="outline" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>Back</Button>
            {step < STEPS.length - 1 ? (
              <Button type="button" disabled={!canProceed} onClick={() => setStep((s) => s + 1)}>Next</Button>
            ) : (
              <Button type="button" disabled={createMutation.isPending} onClick={() => createMutation.mutate(undefined)}>
                {createMutation.isPending ? "Creating..." : "Create Student"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!capacityMessage}
        onOpenChange={(open) => !open && setCapacityMessage(null)}
        title="Section at capacity"
        description={capacityMessage ?? undefined}
        confirmLabel="Continue anyway"
        loading={createMutation.isPending}
        onConfirm={() => {
          setCapacityMessage(null);
          createMutation.mutate(true);
        }}
      />
    </PageWrapper>
  );
}
