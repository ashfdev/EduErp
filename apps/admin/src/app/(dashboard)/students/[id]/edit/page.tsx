"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  ConfirmDialog,
} from "@education-erp/ui";
import { api } from "@/lib/api";
import { useInstitution } from "@/hooks/use-institution";

interface ClassOption {
  id: string;
  name_en: string;
  sections: { id: string; name: string; shift: { id: string; name: string } | null }[];
  groups: { id: string; name_en: string }[];
}

interface StudentProfile {
  personal: {
    id: string;
    name_en: string;
    name_bn: string | null;
    middle_name: string | null;
    nick_name: string | null;
    gender: string;
    date_of_birth: string | null;
    religion: string | null;
    nationality: string | null;
    blood_group: string | null;
    phone: string | null;
    other_phone: string | null;
    passport_no: string | null;
    address_permanent: string | null;
    address_current: string | null;
    district: string | null;
    has_disability: boolean;
    disability_note: string | null;
    father_name: string | null;
    father_phone: string | null;
    father_occupation: string | null;
    mother_name: string | null;
    mother_phone: string | null;
    mother_occupation: string | null;
  };
  academic: {
    current: {
      class: { id: string; name_en: string } | null;
      section: { id: string; name: string } | null;
      group: { id: string; name_en: string } | null;
      roll_no: string | null;
      registration_no: string | null;
    };
  };
}

const RELIGIONS = ["Islam", "Hinduism", "Christianity", "Buddhism", "Other"];
const NATIONALITIES = ["Bangladeshi", "Indian", "Other"];

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
  district: "",
  has_disability: false,
  disability_note: "",
  father_name: "",
  father_phone: "",
  father_occupation: "",
  mother_name: "",
  mother_phone: "",
  mother_occupation: "",
  current_class_id: "",
  current_section_id: "",
  group_id: "",
  current_roll_no: "",
  registration_no: "",
};

export default function EditStudentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { terms } = useInstitution();
  const [form, setForm] = useState(emptyForm);
  const [loaded, setLoaded] = useState(false);
  const [capacityMessage, setCapacityMessage] = useState<string | null>(null);

  const { data: profile } = useQuery<StudentProfile>({
    queryKey: ["students", id],
    queryFn: async () => (await api.get(`/api/students/${id}`)).data.data,
  });
  const { data: classes } = useQuery<ClassOption[]>({
    queryKey: ["settings", "classes"],
    queryFn: async () => (await api.get("/api/settings/classes")).data.data,
  });

  useEffect(() => {
    if (!profile || loaded) return;
    const p = profile.personal;
    const a = profile.academic.current;
    setForm({
      name_en: p.name_en,
      name_bn: p.name_bn ?? "",
      middle_name: p.middle_name ?? "",
      nick_name: p.nick_name ?? "",
      gender: p.gender as "MALE" | "FEMALE" | "OTHER",
      date_of_birth: p.date_of_birth ? p.date_of_birth.slice(0, 10) : "",
      religion: p.religion ?? "",
      nationality: p.nationality ?? "Bangladeshi",
      blood_group: p.blood_group ?? "",
      phone: p.phone ?? "",
      other_phone: p.other_phone ?? "",
      passport_no: p.passport_no ?? "",
      address_current: p.address_current ?? "",
      address_permanent: p.address_permanent ?? "",
      district: p.district ?? "",
      has_disability: p.has_disability,
      disability_note: p.disability_note ?? "",
      father_name: p.father_name ?? "",
      father_phone: p.father_phone ?? "",
      father_occupation: p.father_occupation ?? "",
      mother_name: p.mother_name ?? "",
      mother_phone: p.mother_phone ?? "",
      mother_occupation: p.mother_occupation ?? "",
      current_class_id: a.class?.id ?? "",
      current_section_id: a.section?.id ?? "",
      group_id: a.group?.id ?? "",
      current_roll_no: a.roll_no ?? "",
      registration_no: a.registration_no ?? "",
    });
    setLoaded(true);
  }, [profile, loaded]);

  const selectedClass = classes?.find((c) => c.id === form.current_class_id);
  const originalClassId = profile?.academic.current.class?.id ?? "";
  const classChanged = form.current_class_id !== originalClassId;
  const groupRequiredButMissing = !!selectedClass?.groups.length && !form.group_id;

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const saveMutation = useMutation({
    mutationFn: (override?: boolean) =>
      api.put(`/api/students/${id}`, {
        ...form,
        override,
        name_bn: form.name_bn || undefined,
        middle_name: form.middle_name || undefined,
        nick_name: form.nick_name || undefined,
        date_of_birth: form.date_of_birth || undefined,
        religion: form.religion || undefined,
        nationality: form.nationality || undefined,
        blood_group: form.blood_group || undefined,
        phone: form.phone || undefined,
        other_phone: form.other_phone || undefined,
        passport_no: form.passport_no || undefined,
        address_current: form.address_current || undefined,
        address_permanent: form.address_permanent || undefined,
        district: form.district || undefined,
        disability_note: form.disability_note || undefined,
        father_name: form.father_name || undefined,
        father_occupation: form.father_occupation || undefined,
        mother_name: form.mother_name || undefined,
        mother_phone: form.mother_phone || undefined,
        mother_occupation: form.mother_occupation || undefined,
        current_section_id: form.current_section_id || undefined,
        group_id: form.group_id || undefined,
        current_roll_no: form.current_roll_no || undefined,
        registration_no: form.registration_no || undefined,
      }),
    onSuccess: () => {
      toast.success(classChanged ? `Student promoted to ${selectedClass?.name_en ?? "the new class"}` : "Student updated");
      // Prefix match: also invalidates ["students", id] (the profile page)
      // and the promotion roster, not just the list page.
      queryClient.invalidateQueries({ queryKey: ["students"] });
      router.push(`/students/${id}`);
    },
    onError: (err: unknown) => {
      const error = (err as { response?: { data?: { error?: { code?: string; message?: string } } } })?.response?.data?.error;
      if (error?.code === "SECTION_AT_CAPACITY") {
        setCapacityMessage(error.message ?? "This section is at or over capacity.");
        return;
      }
      toast.error(error?.message ?? "Failed to update student");
    },
  });

  if (!profile) return null;

  return (
    <PageWrapper>
      <PageHeader
        title={`Edit ${profile.personal.name_en}`}
        breadcrumbs={[{ label: "Students", href: "/students" }, { label: profile.personal.name_en, href: `/students/${id}` }, { label: "Edit" }]}
      />

      <Card>
        <CardContent className="space-y-6 pt-6">
          <div>
            <p className="mb-3 text-sm font-semibold">Personal Information</p>
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
              <div className="space-y-1.5"><Label>District</Label><Input value={form.district} onChange={(e) => set("district", e.target.value)} /></div>
              <div />
              <div className="col-span-2 space-y-1.5"><Label>Present Address</Label><Input value={form.address_current} onChange={(e) => set("address_current", e.target.value)} /></div>
              <div className="col-span-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Permanent Address</Label>
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => set("address_permanent", form.address_current)}
                  >
                    Same as Present Address
                  </button>
                </div>
                <Input value={form.address_permanent} onChange={(e) => set("address_permanent", e.target.value)} />
              </div>
              <div className="col-span-2 flex items-center justify-between">
                <Label>Has disability</Label>
                <Switch checked={form.has_disability} onCheckedChange={(v) => set("has_disability", v)} />
              </div>
              {form.has_disability && (
                <div className="col-span-2 space-y-1.5"><Label>Disability Note</Label><Input value={form.disability_note} onChange={(e) => set("disability_note", e.target.value)} /></div>
              )}
            </div>
          </div>

          <div>
            <p className="mb-3 text-sm font-semibold">Guardian Information</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Father&apos;s Name</Label><Input value={form.father_name} onChange={(e) => set("father_name", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Father&apos;s Phone *</Label><Input value={form.father_phone} onChange={(e) => set("father_phone", e.target.value)} placeholder="01XXXXXXXXX" /></div>
              <div className="space-y-1.5"><Label>Father&apos;s Occupation</Label><Input value={form.father_occupation} onChange={(e) => set("father_occupation", e.target.value)} /></div>
              <div />
              <div className="space-y-1.5"><Label>Mother&apos;s Name</Label><Input value={form.mother_name} onChange={(e) => set("mother_name", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Mother&apos;s Phone</Label><Input value={form.mother_phone} onChange={(e) => set("mother_phone", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Mother&apos;s Occupation</Label><Input value={form.mother_occupation} onChange={(e) => set("mother_occupation", e.target.value)} /></div>
            </div>
          </div>

          <div>
            <p className="mb-3 text-sm font-semibold">Academic Placement</p>
            <p className="mb-3 text-xs text-muted-foreground">
              Changing class here re-evaluates subject assignments and records a promotion-history entry, same as the Promote action.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{terms.term_class} *</Label>
                <Select
                  value={form.current_class_id}
                  onValueChange={(v) => { set("current_class_id", v); set("current_section_id", ""); if (v !== originalClassId) set("group_id", ""); }}
                >
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
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
                  <Label>Group / Stream *{classChanged && <span className="ml-1 text-xs text-amber-600">(re-select — class changed)</span>}</Label>
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
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={() => router.push(`/students/${id}`)}>Cancel</Button>
            <Button
              type="button"
              disabled={saveMutation.isPending || !form.name_en || !form.father_phone || !form.current_class_id || groupRequiredButMissing}
              onClick={() => saveMutation.mutate(undefined)}
            >
              {saveMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!capacityMessage}
        onOpenChange={(open) => !open && setCapacityMessage(null)}
        title="Section at capacity"
        description={capacityMessage ?? undefined}
        confirmLabel="Continue anyway"
        loading={saveMutation.isPending}
        onConfirm={() => {
          setCapacityMessage(null);
          saveMutation.mutate(true);
        }}
      />
    </PageWrapper>
  );
}
