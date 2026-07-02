"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, Label, Checkbox } from "@education-erp/ui";
import { api } from "@/lib/api";

interface Department {
  id: string;
  name_en: string;
}

const ROLES = ["CLASS_TEACHER", "SUBJECT_TEACHER", "HEAD_OF_DEPT", "ACCOUNTANT", "LIBRARIAN", "TRANSPORT_MANAGER", "HOSTEL_MANAGER", "PROCTOR", "REGISTRAR", "IT_ADMIN", "VICE_PRINCIPAL", "PRINCIPAL"];

export default function NewStaffPage() {
  const router = useRouter();
  const [nameEn, setNameEn] = useState("");
  const [designation, setDesignation] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [role, setRole] = useState("SUBJECT_TEACHER");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [employmentType, setEmploymentType] = useState("PERMANENT");
  const [showOnWebsite, setShowOnWebsite] = useState(false);
  const [createLogin, setCreateLogin] = useState(true);

  const { data: departments } = useQuery<Department[]>({ queryKey: ["settings", "departments"], queryFn: async () => (await api.get("/api/settings/departments")).data.data });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post("/api/hr/staff", {
        name_en: nameEn,
        designation,
        department_id: departmentId || undefined,
        role,
        phone: phone || undefined,
        email: email || undefined,
        employment_type: employmentType,
        show_on_website: showOnWebsite,
        create_login: createLogin,
      }),
    onSuccess: (res) => {
      toast.success("Staff member added");
      router.push(`/hr/staff/${res.data.data.id}`);
    },
    onError: () => toast.error("Failed to add staff member"),
  });

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
              <Label>Role</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5">
            <Label>Employment Type</Label>
            <select className="w-full rounded-md border px-3 py-2 text-sm" value={employmentType} onChange={(e) => setEmploymentType(e.target.value)}>
              <option value="PERMANENT">Permanent</option>
              <option value="CONTRACT">Contract</option>
              <option value="PART_TIME">Part Time</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={createLogin} onCheckedChange={(v) => setCreateLogin(!!v)} /> Create login account (requires phone) — sends temp password via SMS</label>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={showOnWebsite} onCheckedChange={(v) => setShowOnWebsite(!!v)} /> Show on public faculty directory</label>

          <Button disabled={!canSubmit || createMutation.isPending} onClick={() => createMutation.mutate()}>
            {createMutation.isPending ? "Saving..." : "Add Staff"}
          </Button>
        </CardContent>
      </Card>
    </PageWrapper>
  );
}
