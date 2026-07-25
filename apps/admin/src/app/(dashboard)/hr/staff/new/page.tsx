"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Badge, Button, Card, CardContent, Checkbox,
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
  Input, Label, PageHeader, PageWrapper, extractErrorMessage,
} from "@education-erp/ui";
import { api } from "@/lib/api";

interface Department {
  id: string;
  name_en: string;
}
interface Program {
  id: string;
  name_en: string;
}
interface SalaryStructureOption {
  id: string;
  name: string;
  is_default: boolean;
}

// Must mirror server/api/src/lib/roles.ts's TEACHING_ROLES exactly — kept
// as a small frontend-only mirror rather than fetched, since it only drives
// the optgroup split/default here, not any authorization decision.
const TEACHING_ROLES = ["CLASS_TEACHER", "SUBJECT_TEACHER", "HEAD_OF_DEPT"];
const NON_TEACHING_ROLES = ["ACCOUNTANT", "LIBRARIAN", "TRANSPORT_MANAGER", "HOSTEL_MANAGER", "PROCTOR", "REGISTRAR", "IT_ADMIN", "VICE_PRINCIPAL", "PRINCIPAL"];
const DOC_TYPES = ["CERTIFICATE", "NID", "TIN", "CONTRACT", "OTHER"] as const;
const STEPS = ["Personal & Photo", "Contact & Address", "Employment", "Documents & History", "Review"];

interface StagedDoc {
  file: File;
  doc_type: (typeof DOC_TYPES)[number];
  title: string;
}
interface StagedExperience {
  institution_name: string;
  designation: string;
  location: string;
  responsibility: string;
  start_date: string;
  end_date: string;
}
interface StagedReference {
  name: string;
  designation: string;
  relation: string;
  address: string;
  phone: string;
}

export default function NewStaffPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const category = searchParams.get("category") === "STAFF" || searchParams.get("category") === "FACULTY" ? searchParams.get("category") : null;

  const [step, setStep] = useState(0);
  const [nameEn, setNameEn] = useState("");
  const [designation, setDesignation] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [religion, setReligion] = useState("");
  const [bloodGroup, setBloodGroup] = useState("");
  const [nid, setNid] = useState("");
  const [tin, setTin] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);

  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [addressHouseName, setAddressHouseName] = useState("");
  const [addressVillage, setAddressVillage] = useState("");
  const [addressPostCode, setAddressPostCode] = useState("");
  const [addressDistrict, setAddressDistrict] = useState("");
  const [addressDivision, setAddressDivision] = useState("");
  const [addressRoadArea, setAddressRoadArea] = useState("");

  const [departmentId, setDepartmentId] = useState("");
  const [programId, setProgramId] = useState("");
  const [role, setRole] = useState(category === "STAFF" ? NON_TEACHING_ROLES[0]! : "SUBJECT_TEACHER");
  const [employmentType, setEmploymentType] = useState("PERMANENT");
  // null = not yet touched by the user — falls back to whichever structure
  // is marked default once loaded. An empty string is a deliberate user
  // choice to clear it (some employment types have no fixed structure yet).
  const [salaryStructureId, setSalaryStructureId] = useState<string | null>(null);
  const [showOnWebsite, setShowOnWebsite] = useState(false);
  const [createLogin, setCreateLogin] = useState(true);
  const [loginPassword, setLoginPassword] = useState("");
  const [credentialModal, setCredentialModal] = useState<{ staffId: string; name: string; phone: string; password: string } | null>(null);

  const [stagedDocs, setStagedDocs] = useState<StagedDoc[]>([]);
  const [newDocType, setNewDocType] = useState<(typeof DOC_TYPES)[number]>("CERTIFICATE");
  const [newDocTitle, setNewDocTitle] = useState("");
  const [newDocFile, setNewDocFile] = useState<File | null>(null);

  const emptyExperienceRow: StagedExperience = { institution_name: "", designation: "", location: "", responsibility: "", start_date: "", end_date: "" };
  const [stagedExperience, setStagedExperience] = useState<StagedExperience[]>([]);
  const [newExperience, setNewExperience] = useState<StagedExperience>(emptyExperienceRow);

  const emptyReferenceRow: StagedReference = { name: "", designation: "", relation: "", address: "", phone: "" };
  const [stagedReference, setStagedReference] = useState<StagedReference[]>([]);
  const [newReference, setNewReference] = useState<StagedReference>(emptyReferenceRow);

  const { data: departments } = useQuery<Department[]>({ queryKey: ["settings", "departments"], queryFn: async () => (await api.get("/api/settings/departments")).data.data });
  const { data: programs } = useQuery<Program[]>({ queryKey: ["settings", "programs"], queryFn: async () => (await api.get("/api/settings/programs")).data.data });
  const { data: salaryStructures } = useQuery<SalaryStructureOption[]>({ queryKey: ["hr", "salary-structures"], queryFn: async () => (await api.get("/api/hr/salary-structures")).data.data });
  const defaultSalaryStructureId = salaryStructures?.find((s) => s.is_default)?.id ?? "";
  const effectiveSalaryStructureId = salaryStructureId ?? defaultSalaryStructureId;

  async function handlePhotoSelect(file: File | null) {
    if (!file) return;
    setPhotoUploading(true);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await api.post("/api/hr/staff/photo", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setPhotoUrl(res.data.data.photo_url);
    } catch (err) {
      toast.error(extractErrorMessage(err) ?? "Failed to upload photo");
    } finally {
      setPhotoUploading(false);
    }
  }

  function addStagedDoc() {
    if (!newDocFile || !newDocTitle) return;
    setStagedDocs((prev) => [...prev, { file: newDocFile, doc_type: newDocType, title: newDocTitle }]);
    setNewDocFile(null);
    setNewDocTitle("");
  }

  function addStagedExperience() {
    if (!newExperience.institution_name) return;
    setStagedExperience((prev) => [...prev, newExperience]);
    setNewExperience(emptyExperienceRow);
  }

  function addStagedReference() {
    if (!newReference.name) return;
    setStagedReference((prev) => [...prev, newReference]);
    setNewReference(emptyReferenceRow);
  }

  const createMutation = useMutation({
    mutationFn: () =>
      api.post("/api/hr/staff", {
        name_en: nameEn,
        designation,
        date_of_birth: dateOfBirth || undefined,
        gender: gender || undefined,
        religion: religion || undefined,
        blood_group: bloodGroup || undefined,
        nid: nid || undefined,
        tin: tin || undefined,
        photo_url: photoUrl || undefined,
        department_id: departmentId || undefined,
        program_id: programId || undefined,
        role,
        phone: phone || undefined,
        email: email || undefined,
        address: addressRoadArea || undefined,
        address_house_name: addressHouseName || undefined,
        address_village: addressVillage || undefined,
        address_post_code: addressPostCode || undefined,
        address_district: addressDistrict || undefined,
        address_division: addressDivision || undefined,
        employment_type: employmentType,
        salary_structure_id: effectiveSalaryStructureId || undefined,
        show_on_website: showOnWebsite,
        create_login: createLogin,
        login_password: createLogin ? loginPassword || undefined : undefined,
      }),
    onSuccess: async (res) => {
      const staffId = res.data.data.id as string;
      let failedCount = 0;
      for (const doc of stagedDocs) {
        try {
          const fd = new FormData();
          fd.append("file", doc.file);
          fd.append("doc_type", doc.doc_type);
          fd.append("title", doc.title);
          await api.post(`/api/hr/staff/${staffId}/documents`, fd, { headers: { "Content-Type": "multipart/form-data" } });
        } catch {
          failedCount++;
        }
      }
      if (failedCount > 0) {
        toast(`${failedCount} document(s) failed to upload — add them manually from the Documents tab.`);
      }
      for (const exp of stagedExperience) {
        try {
          await api.post(`/api/hr/staff/${staffId}/experience`, {
            institution_name: exp.institution_name,
            designation: exp.designation || undefined,
            location: exp.location || undefined,
            responsibility: exp.responsibility || undefined,
            start_date: exp.start_date || undefined,
            end_date: exp.end_date || undefined,
          });
        } catch {
          // Non-blocking — the profile page's Experience section lets it be added manually.
        }
      }
      for (const ref of stagedReference) {
        try {
          await api.post(`/api/hr/staff/${staffId}/reference`, {
            name: ref.name,
            designation: ref.designation || undefined,
            relation: ref.relation || undefined,
            address: ref.address || undefined,
            phone: ref.phone || undefined,
          });
        } catch {
          // Non-blocking — the profile page's Reference section lets it be added manually.
        }
      }
      if (res.data.data.temp_password) {
        setCredentialModal({ staffId, name: nameEn, phone, password: res.data.data.temp_password });
      } else {
        toast.success("Staff member added");
        router.push(`/hr/staff/${staffId}`);
      }
    },
    onError: (err: unknown) => {
      const message = extractErrorMessage(err);
      toast.error(message ?? "Failed to add staff member");
    },
  });

  function copyPassword() {
    if (!credentialModal) return;
    navigator.clipboard.writeText(credentialModal.password).then(
      () => toast.success("Password copied"),
      () => toast.error("Couldn't copy — select and copy manually"),
    );
  }

  const canProceed =
    (step === 0 && nameEn && designation && !!photoUrl) ||
    step === 1 ||
    step === 2 ||
    step === 3 ||
    step === 4;

  const canSubmit = nameEn && designation && !!photoUrl && (!createLogin || phone);

  return (
    <PageWrapper>
      <PageHeader title="Add Staff" breadcrumbs={[{ label: "HR", href: "/hr" }, { label: "Staff", href: "/hr/staff" }, { label: "Add" }]} />

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
              <div className="col-span-2 space-y-1.5">
                <Label>Photo *</Label>
                <div className="flex items-center gap-3">
                  {photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoUrl} alt="Staff photo" className="h-16 w-16 rounded-full object-cover border" />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-full border bg-muted text-xs text-muted-foreground">No photo</div>
                  )}
                  <Input type="file" accept="image/*" onChange={(e) => handlePhotoSelect(e.target.files?.[0] ?? null)} disabled={photoUploading} className="max-w-xs" />
                  {photoUploading && <span className="text-xs text-muted-foreground">Uploading...</span>}
                </div>
                <p className="text-xs text-muted-foreground">A photo is required before continuing.</p>
              </div>
              <div className="space-y-1.5"><Label>Full Name *</Label><Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Designation *</Label><Input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="Assistant Teacher" /></div>
              <div className="space-y-1.5"><Label>Date of Birth</Label><Input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} /></div>
              <div className="space-y-1.5">
                <Label>Gender</Label>
                <select className="w-full rounded-md border px-3 py-2 text-sm" value={gender} onChange={(e) => setGender(e.target.value)}>
                  <option value="">Select...</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div className="space-y-1.5"><Label>Religion</Label><Input value={religion} onChange={(e) => setReligion(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Blood Group</Label><Input value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>NID</Label><Input value={nid} onChange={(e) => setNid(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>TIN</Label><Input value={tin} onChange={(e) => setTin(e.target.value)} /></div>
            </div>
          )}

          {step === 1 && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" /></div>
              <div className="space-y-1.5"><Label>Email</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <div className="col-span-2 space-y-1.5"><Label>Road / Area (optional)</Label><Input value={addressRoadArea} onChange={(e) => setAddressRoadArea(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>House Name</Label><Input value={addressHouseName} onChange={(e) => setAddressHouseName(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Village</Label><Input value={addressVillage} onChange={(e) => setAddressVillage(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Post Code</Label><Input value={addressPostCode} onChange={(e) => setAddressPostCode(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>District</Label><Input value={addressDistrict} onChange={(e) => setAddressDistrict(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Division</Label><Input value={addressDivision} onChange={(e) => setAddressDivision(e.target.value)} /></div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Department</Label>
                  <select className="w-full rounded-md border px-3 py-2 text-sm" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                    <option value="">None</option>
                    {departments?.map((d) => <option key={d.id} value={d.id}>{d.name_en}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Program (optional)</Label>
                  <select className="w-full rounded-md border px-3 py-2 text-sm" value={programId} onChange={(e) => setProgramId(e.target.value)}>
                    <option value="">None</option>
                    {programs?.map((p) => <option key={p.id} value={p.id}>{p.name_en}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Role</Label>
                  <select className="w-full rounded-md border px-3 py-2 text-sm" value={role} onChange={(e) => setRole(e.target.value)}>
                    <optgroup label="Teaching">
                      {TEACHING_ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
                    </optgroup>
                    <optgroup label="Non-Teaching">
                      {NON_TEACHING_ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
                    </optgroup>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Employment Type</Label>
                  <select className="w-full rounded-md border px-3 py-2 text-sm" value={employmentType} onChange={(e) => setEmploymentType(e.target.value)}>
                    <option value="PERMANENT">Permanent</option>
                    <option value="CONTRACT">Contract</option>
                    <option value="PART_TIME">Part Time</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Salary Structure</Label>
                <select className="w-full rounded-md border px-3 py-2 text-sm" value={effectiveSalaryStructureId} onChange={(e) => setSalaryStructureId(e.target.value)}>
                  <option value="">None</option>
                  {salaryStructures?.map((s) => <option key={s.id} value={s.id}>{s.name}{s.is_default ? " (Default)" : ""}</option>)}
                </select>
                <p className="text-xs text-muted-foreground">Needed for this staff member to show up in Payroll. Can be set or changed later too.</p>
              </div>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={createLogin} onCheckedChange={(v) => setCreateLogin(!!v)} /> Create login account (requires phone) — sends temp password via SMS</label>
              {createLogin && (
                <div className="space-y-1.5 pl-6">
                  <Label>Initial Password (optional)</Label>
                  <Input
                    type="text"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Leave blank to auto-generate a memorable password"
                    className="max-w-sm font-mono"
                  />
                  <p className="text-xs text-muted-foreground">If set, min 8 characters with an uppercase letter, a lowercase letter, and a number. The staff member must still change it on first login.</p>
                </div>
              )}
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={showOnWebsite} onCheckedChange={(v) => setShowOnWebsite(!!v)} /> Show on public faculty directory</label>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Optional — you can also add documents later from this staff member&apos;s profile.</p>
              <div className="space-y-2">
                {stagedDocs.map((d, i) => (
                  <div key={i} className="flex items-center justify-between rounded-md border p-2 text-sm">
                    <span><Badge variant="outline">{d.doc_type}</Badge> {d.title} — {d.file.name}</span>
                    <Button size="sm" variant="outline" onClick={() => setStagedDocs((prev) => prev.filter((_, idx) => idx !== i))}>Remove</Button>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-4 gap-3 items-end rounded-md border p-3">
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <select className="w-full rounded-md border px-3 py-2 text-sm" value={newDocType} onChange={(e) => setNewDocType(e.target.value as (typeof DOC_TYPES)[number])}>
                    {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5"><Label>Title</Label><Input value={newDocTitle} onChange={(e) => setNewDocTitle(e.target.value)} placeholder="e.g. B.Ed Certificate" /></div>
                <div className="space-y-1.5"><Label>File</Label><Input type="file" onChange={(e) => setNewDocFile(e.target.files?.[0] ?? null)} /></div>
                <Button type="button" variant="outline" disabled={!newDocFile || !newDocTitle} onClick={addStagedDoc}>+ Add</Button>
              </div>

              <p className="pt-2 text-sm font-medium">Experience (optional)</p>
              <div className="space-y-2">
                {stagedExperience.map((exp, i) => (
                  <div key={i} className="flex items-center justify-between rounded-md border p-2 text-sm">
                    <span>{exp.institution_name}{exp.designation ? ` — ${exp.designation}` : ""}</span>
                    <Button size="sm" variant="outline" onClick={() => setStagedExperience((prev) => prev.filter((_, idx) => idx !== i))}>Remove</Button>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3 rounded-md border p-3">
                <div className="space-y-1.5"><Label>Institution</Label><Input value={newExperience.institution_name} onChange={(e) => setNewExperience({ ...newExperience, institution_name: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Designation</Label><Input value={newExperience.designation} onChange={(e) => setNewExperience({ ...newExperience, designation: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Location</Label><Input value={newExperience.location} onChange={(e) => setNewExperience({ ...newExperience, location: e.target.value })} /></div>
                <div className="col-span-2 space-y-1.5"><Label>Responsibility</Label><Input value={newExperience.responsibility} onChange={(e) => setNewExperience({ ...newExperience, responsibility: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Start Date</Label><Input type="date" value={newExperience.start_date} onChange={(e) => setNewExperience({ ...newExperience, start_date: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>End Date</Label><Input type="date" value={newExperience.end_date} onChange={(e) => setNewExperience({ ...newExperience, end_date: e.target.value })} /></div>
                <Button type="button" variant="outline" disabled={!newExperience.institution_name} onClick={addStagedExperience}>+ Add</Button>
              </div>

              <p className="pt-2 text-sm font-medium">Reference (optional)</p>
              <div className="space-y-2">
                {stagedReference.map((ref, i) => (
                  <div key={i} className="flex items-center justify-between rounded-md border p-2 text-sm">
                    <span>{ref.name}{ref.designation ? ` — ${ref.designation}` : ""}{ref.relation ? ` (${ref.relation})` : ""}</span>
                    <Button size="sm" variant="outline" onClick={() => setStagedReference((prev) => prev.filter((_, idx) => idx !== i))}>Remove</Button>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3 rounded-md border p-3">
                <div className="space-y-1.5"><Label>Name</Label><Input value={newReference.name} onChange={(e) => setNewReference({ ...newReference, name: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Designation</Label><Input value={newReference.designation} onChange={(e) => setNewReference({ ...newReference, designation: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Relation</Label><Input value={newReference.relation} onChange={(e) => setNewReference({ ...newReference, relation: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Phone</Label><Input value={newReference.phone} onChange={(e) => setNewReference({ ...newReference, phone: e.target.value })} /></div>
                <div className="col-span-2 space-y-1.5"><Label>Address</Label><Input value={newReference.address} onChange={(e) => setNewReference({ ...newReference, address: e.target.value })} /></div>
                <Button type="button" variant="outline" disabled={!newReference.name} onClick={addStagedReference}>+ Add</Button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                {photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoUrl} alt="Staff photo" className="h-16 w-16 rounded-full object-cover border" />
                )}
                <div>
                  <p className="text-sm font-medium">{nameEn} — {designation}</p>
                  <p className="text-xs text-muted-foreground">{role.replace(/_/g, " ")}{gender ? ` · ${gender}` : ""}{dateOfBirth ? ` · DOB ${dateOfBirth}` : ""}</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">NID: {nid || "—"} · TIN: {tin || "—"}</p>
              <p className="text-sm text-muted-foreground">Phone: {phone || "—"} · Email: {email || "—"}</p>
              <p className="text-sm text-muted-foreground">
                Address: {[addressHouseName, addressVillage, addressRoadArea, addressPostCode, addressDistrict, addressDivision].filter(Boolean).join(", ") || "—"}
              </p>
              <p className="text-sm text-muted-foreground">
                Department: {departments?.find((d) => d.id === departmentId)?.name_en ?? "—"} · Employment: {employmentType}
              </p>
              <p className="text-sm text-muted-foreground">Documents staged: {stagedDocs.length}</p>
              <p className="text-sm text-muted-foreground">Experience entries: {stagedExperience.length} · Reference entries: {stagedReference.length}</p>
            </div>
          )}

          <div className="flex justify-between pt-4">
            <Button type="button" variant="outline" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>Back</Button>
            {step < STEPS.length - 1 ? (
              <Button type="button" disabled={!canProceed} onClick={() => setStep((s) => s + 1)}>Next</Button>
            ) : (
              <Button type="button" disabled={!canSubmit || createMutation.isPending} onClick={() => createMutation.mutate()}>
                {createMutation.isPending ? "Creating..." : "Add Staff"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!credentialModal} onOpenChange={(v) => !v && router.push(`/hr/staff/${credentialModal?.staffId}`)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Login Credentials — {credentialModal?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-amber-700">Save this now — it will not be shown again. It was also sent via SMS to {credentialModal?.phone}.</p>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input readOnly value={credentialModal?.phone ?? ""} className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label>Temporary Password</Label>
              <div className="flex gap-2">
                <Input readOnly value={credentialModal?.password ?? ""} className="font-mono" />
                <Button type="button" variant="outline" onClick={copyPassword}>Copy</Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">The staff member will be required to set their own password on first login.</p>
          </div>
          <DialogFooter>
            <Button onClick={() => router.push(`/hr/staff/${credentialModal?.staffId}`)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
