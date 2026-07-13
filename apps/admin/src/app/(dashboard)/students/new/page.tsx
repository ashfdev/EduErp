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
} from "@education-erp/ui";
import { api } from "@/lib/api";

const STEPS = ["Personal", "Guardian", "Academic Placement", "Subjects", "Review"];

interface ClassOption {
  id: string;
  name_en: string;
  sections: { id: string; name: string }[];
}

interface SubjectOption {
  id: string;
  name_en: string;
  is_compulsory: boolean;
  is_optional: boolean;
}

const emptyForm = {
  name_en: "",
  name_bn: "",
  gender: "MALE" as "MALE" | "FEMALE" | "OTHER",
  date_of_birth: "",
  religion: "",
  blood_group: "",
  phone: "",
  address_permanent: "",
  district: "",
  has_disability: false,
  disability_note: "",
  father_name: "",
  father_phone: "",
  father_occupation: "",
  mother_name: "",
  mother_phone: "",
  mother_occupation: "",
  academic_year_id: "",
  current_class_id: "",
  current_section_id: "",
  current_roll_no: "",
  registration_no: "",
  board_roll: "",
  admission_date: new Date().toISOString().slice(0, 10),
  previous_institution: "",
  previous_class: "",
  previous_result: "",
  send_portal_login_sms: true,
};

export default function NewStudentPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(emptyForm);
  const [selectedOptional, setSelectedOptional] = useState<string[]>([]);

  const { data: years } = useQuery<{ id: string; label: string; is_active: boolean }[]>({
    queryKey: ["settings", "academic-years"],
    queryFn: async () => (await api.get("/api/settings/academic-years")).data.data,
  });
  const { data: classes } = useQuery<ClassOption[]>({
    queryKey: ["settings", "classes"],
    queryFn: async () => (await api.get("/api/settings/classes")).data.data,
  });

  const selectedClass = classes?.find((c) => c.id === form.current_class_id);

  const { data: subjects } = useQuery<SubjectOption[]>({
    queryKey: ["subjects", form.current_class_id],
    queryFn: async () => (await api.get("/api/subjects", { params: { class_id: form.current_class_id } })).data.data,
    enabled: !!form.current_class_id,
  });

  const compulsory = subjects?.filter((s) => s.is_compulsory) ?? [];
  const optional = subjects?.filter((s) => s.is_optional) ?? [];

  const createMutation = useMutation({
    mutationFn: () =>
      api.post("/api/students", {
        ...form,
        date_of_birth: form.date_of_birth || undefined,
        selected_optional_subject_ids: selectedOptional,
      }),
    onSuccess: (res) => {
      toast.success(`Student created — ID: ${res.data.data.student_uid}`);
      router.push(`/students/${res.data.data.id}`);
    },
    onError: () => toast.error("Failed to create student — check required fields"),
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const canProceed =
    (step === 0 && form.name_en && form.gender) ||
    (step === 1 && form.father_phone) ||
    (step === 2 && form.academic_year_id && form.current_class_id) ||
    step === 3 ||
    step === 4;

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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Name (English) *</Label><Input value={form.name_en} onChange={(e) => set("name_en", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Name (Bangla)</Label><Input value={form.name_bn} onChange={(e) => set("name_bn", e.target.value)} /></div>
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
              <div className="space-y-1.5"><Label>Religion</Label><Input value={form.religion} onChange={(e) => set("religion", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Blood Group</Label><Input value={form.blood_group} onChange={(e) => set("blood_group", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Student Phone (optional)</Label><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>District</Label><Input value={form.district} onChange={(e) => set("district", e.target.value)} /></div>
              <div className="col-span-2 space-y-1.5"><Label>Permanent Address</Label><Input value={form.address_permanent} onChange={(e) => set("address_permanent", e.target.value)} /></div>
              <div className="col-span-2 flex items-center justify-between">
                <Label>Has disability</Label>
                <Switch checked={form.has_disability} onCheckedChange={(v) => set("has_disability", v)} />
              </div>
              {form.has_disability && (
                <div className="col-span-2 space-y-1.5"><Label>Disability Note</Label><Input value={form.disability_note} onChange={(e) => set("disability_note", e.target.value)} /></div>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Father&apos;s Name</Label><Input value={form.father_name} onChange={(e) => set("father_name", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Father&apos;s Phone *</Label><Input value={form.father_phone} onChange={(e) => set("father_phone", e.target.value)} placeholder="01XXXXXXXXX" /></div>
              <div className="space-y-1.5"><Label>Father&apos;s Occupation</Label><Input value={form.father_occupation} onChange={(e) => set("father_occupation", e.target.value)} /></div>
              <div />
              <div className="space-y-1.5"><Label>Mother&apos;s Name</Label><Input value={form.mother_name} onChange={(e) => set("mother_name", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Mother&apos;s Phone</Label><Input value={form.mother_phone} onChange={(e) => set("mother_phone", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Mother&apos;s Occupation</Label><Input value={form.mother_occupation} onChange={(e) => set("mother_occupation", e.target.value)} /></div>
            </div>
          )}

          {step === 2 && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Academic Year *</Label>
                <Select value={form.academic_year_id} onValueChange={(v) => set("academic_year_id", v)}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    {years?.map((y) => <SelectItem key={y.id} value={y.id}>{y.label}{y.is_active ? " (Active)" : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Class *</Label>
                <Select value={form.current_class_id} onValueChange={(v) => { set("current_class_id", v); set("current_section_id", ""); }}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    {classes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name_en}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Section</Label>
                <Select value={form.current_section_id} onValueChange={(v) => set("current_section_id", v)}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    {selectedClass?.sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Roll No</Label><Input value={form.current_roll_no} onChange={(e) => set("current_roll_no", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Registration No</Label><Input value={form.registration_no} onChange={(e) => set("registration_no", e.target.value)} /></div>
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
            <div className="space-y-3">
              <p className="text-sm">
                <strong>{form.name_en}</strong> ({form.gender}) — {classes?.find((c) => c.id === form.current_class_id)?.name_en}
              </p>
              <p className="text-sm text-muted-foreground">Guardian: {form.father_name} · {form.father_phone}</p>
              <p className="text-sm text-muted-foreground">
                Subjects: {compulsory.length} compulsory + {selectedOptional.length} optional
              </p>
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
              <Button type="button" disabled={createMutation.isPending} onClick={() => createMutation.mutate()}>
                {createMutation.isPending ? "Creating..." : "Create Student"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </PageWrapper>
  );
}
