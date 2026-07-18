"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, Label, Checkbox, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@education-erp/ui";
import { api } from "@/lib/api";

interface Department {
  id: string;
  name_en: string;
}
interface Program {
  id: string;
  name_en: string;
}

// Must mirror server/api/src/lib/roles.ts's TEACHING_ROLES exactly — kept
// as a small frontend-only mirror rather than fetched, since it only drives
// the optgroup split/default here, not any authorization decision.
const TEACHING_ROLES = ["CLASS_TEACHER", "SUBJECT_TEACHER", "HEAD_OF_DEPT"];
const NON_TEACHING_ROLES = ["ACCOUNTANT", "LIBRARIAN", "TRANSPORT_MANAGER", "HOSTEL_MANAGER", "PROCTOR", "REGISTRAR", "IT_ADMIN", "VICE_PRINCIPAL", "PRINCIPAL"];

export default function NewStaffPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const category = searchParams.get("category") === "STAFF" || searchParams.get("category") === "FACULTY" ? searchParams.get("category") : null;

  const [nameEn, setNameEn] = useState("");
  const [designation, setDesignation] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [programId, setProgramId] = useState("");
  const [role, setRole] = useState(category === "STAFF" ? NON_TEACHING_ROLES[0]! : "SUBJECT_TEACHER");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [employmentType, setEmploymentType] = useState("PERMANENT");
  const [showOnWebsite, setShowOnWebsite] = useState(false);
  const [createLogin, setCreateLogin] = useState(true);
  const [loginPassword, setLoginPassword] = useState("");
  const [credentialModal, setCredentialModal] = useState<{ staffId: string; name: string; phone: string; password: string } | null>(null);

  const { data: departments } = useQuery<Department[]>({ queryKey: ["settings", "departments"], queryFn: async () => (await api.get("/api/settings/departments")).data.data });
  const { data: programs } = useQuery<Program[]>({ queryKey: ["settings", "programs"], queryFn: async () => (await api.get("/api/settings/programs")).data.data });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post("/api/hr/staff", {
        name_en: nameEn,
        designation,
        department_id: departmentId || undefined,
        program_id: programId || undefined,
        role,
        phone: phone || undefined,
        email: email || undefined,
        employment_type: employmentType,
        show_on_website: showOnWebsite,
        create_login: createLogin,
        login_password: createLogin ? loginPassword || undefined : undefined,
      }),
    onSuccess: (res) => {
      if (res.data.data.temp_password) {
        setCredentialModal({ staffId: res.data.data.id, name: nameEn, phone, password: res.data.data.temp_password });
      } else {
        toast.success("Staff member added");
        toast("Don't forget to upload their documents (NID, certificates, contract) from the Documents tab.");
        router.push(`/hr/staff/${res.data.data.id}`);
      }
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
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

  const canSubmit = nameEn && designation && (!createLogin || phone);

  return (
    <PageWrapper>
      <PageHeader title="Add Staff" breadcrumbs={[{ label: "HR", href: "/hr" }, { label: "Staff", href: "/hr/staff" }, { label: "Add" }]} />
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Full Name</Label><Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Designation</Label><Input value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="Assistant Teacher" /></div>
          </div>
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
            <div className="space-y-1.5"><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Email</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Employment Type</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={employmentType} onChange={(e) => setEmploymentType(e.target.value)}>
                <option value="PERMANENT">Permanent</option>
                <option value="CONTRACT">Contract</option>
                <option value="PART_TIME">Part Time</option>
              </select>
            </div>
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

          <Button disabled={!canSubmit || createMutation.isPending} onClick={() => createMutation.mutate()}>
            {createMutation.isPending ? "Saving..." : "Add Staff"}
          </Button>
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
            <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">Don&apos;t forget to upload their documents (NID, certificates, contract) from the Documents tab.</p>
          </div>
          <DialogFooter>
            <Button onClick={() => router.push(`/hr/staff/${credentialModal?.staffId}`)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
