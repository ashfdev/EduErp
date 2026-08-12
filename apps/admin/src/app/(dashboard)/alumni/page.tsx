"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper, PageHeader, Card, CardContent, Button, Badge,
  Dialog, DialogContent, DialogHeader, DialogTitle,
  Input, EmptyState, Table, TableHeader, TableBody, TableRow,
  TableHead, TableCell, ErrorState, LoadingSpinner, extractErrorMessage,
} from "@education-erp/ui";
import { api } from "@/lib/api";

interface AlumniProfile {
  id: string;
  graduation_year: number;
  current_profession: string | null;
  higher_education: string | null;
  is_member_of_assoc: boolean;
  student: { id: string; student_uid: string; name_en: string; name_bn: string | null; photo_url: string | null; };
}

interface StudentOption { id: string; name_en: string; student_uid: string; status: string; }

export default function AlumniPage() {
  const qc = useQueryClient();
  const [yearFilter, setYearFilter] = useState("");
  const [memberFilter, setMemberFilter] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editProfile, setEditProfile] = useState<AlumniProfile | null>(null);
  const [studentSearch, setStudentSearch] = useState("");
  const [form, setForm] = useState({ student_id: "", graduation_year: new Date().getFullYear().toString(), current_profession: "", higher_education: "", is_member_of_assoc: false });

  const { data: profiles, isLoading, isError, error, refetch } = useQuery<AlumniProfile[]>({
    queryKey: ["alumni", yearFilter, memberFilter],
    queryFn: async () => (await api.get("/api/alumni", { params: { year: yearFilter || undefined, is_member: memberFilter || undefined } })).data.data,
  });

  const { data: students } = useQuery<StudentOption[]>({
    queryKey: ["students-graduated", studentSearch],
    queryFn: async () => (await api.get("/api/students", { params: { search: studentSearch || undefined, status: "GRADUATED", limit: 30 } })).data.data,
    enabled: showAdd,
  });

  const createMutation = useMutation({
    mutationFn: () => api.post("/api/alumni", { ...form, graduation_year: Number(form.graduation_year) }),
    onSuccess: () => { toast.success("Alumni profile created"); qc.invalidateQueries({ queryKey: ["alumni"] }); setShowAdd(false); },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const updateMutation = useMutation({
    mutationFn: (studentId: string) =>
      api.patch(`/api/alumni/${studentId}`, {
        current_profession: editProfile?.current_profession || null,
        higher_education: editProfile?.higher_education || null,
        is_member_of_assoc: editProfile?.is_member_of_assoc ?? false,
        graduation_year: editProfile ? Number(editProfile.graduation_year) : undefined,
      }),
    onSuccess: () => { toast.success("Profile updated"); qc.invalidateQueries({ queryKey: ["alumni"] }); setEditProfile(null); },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 20 }, (_, i) => currentYear - i);

  return (
    <PageWrapper>
      <PageHeader
        title="Alumni Directory"
        subtitle="Track graduated students and maintain alumni connections"
        breadcrumbs={[{ label: "Alumni" }]}
        action={<Button size="sm" onClick={() => setShowAdd(true)}>+ Add Alumni Profile</Button>}
      />

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <select className="border rounded-md px-3 py-1.5 text-sm" value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
          <option value="">All Years</option>
          {years.map((y) => <option key={y} value={String(y)}>{y}</option>)}
        </select>
        <select className="border rounded-md px-3 py-1.5 text-sm" value={memberFilter} onChange={(e) => setMemberFilter(e.target.value)}>
          <option value="">All Members</option>
          <option value="true">Association Members</option>
          <option value="false">Non-Members</option>
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : isError ? (
        <ErrorState title="Failed to load" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
      ) : !profiles?.length ? (
        <EmptyState title="No alumni profiles" description="Alumni profiles are created when a student's status is set to GRADUATED." />
      ) : (
        <Card>
          <CardContent className="pt-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Graduation Year</TableHead>
                  <TableHead>Profession</TableHead>
                  <TableHead>Higher Education</TableHead>
                  <TableHead>Association</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {p.student.photo_url && <img src={p.student.photo_url} alt="" className="w-8 h-8 rounded-full object-cover" />}
                        <div>
                          <div className="font-medium">{p.student.name_en}</div>
                          <div className="text-xs text-muted-foreground">{p.student.student_uid}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{p.graduation_year}</TableCell>
                    <TableCell>{p.current_profession ?? "—"}</TableCell>
                    <TableCell>{p.higher_education ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={p.is_member_of_assoc ? "success" : "outline"}>
                        {p.is_member_of_assoc ? "Member" : "Non-member"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => setEditProfile(p)}>Edit</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Add Profile Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Alumni Profile</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">Only GRADUATED students can have an alumni profile.</p>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Search Graduated Students</label>
              <Input value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} placeholder="Search by name or UID..." className="mt-1" />
              <div className="mt-2 border rounded-md max-h-36 overflow-y-auto divide-y">
                {students?.map((s) => (
                  <button key={s.id} className={`w-full text-left px-3 py-2 hover:bg-accent/50 text-sm ${form.student_id === s.id ? "bg-accent" : ""}`} onClick={() => setForm({ ...form, student_id: s.id })}>
                    {s.name_en} <span className="text-muted-foreground text-xs">({s.student_uid})</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Graduation Year</label>
                <select className="w-full mt-1 border rounded-md px-3 py-2 text-sm" value={form.graduation_year} onChange={(e) => setForm({ ...form, graduation_year: e.target.value })}>
                  {years.map((y) => <option key={y} value={String(y)}>{y}</option>)}
                </select>
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" checked={form.is_member_of_assoc} onChange={(e) => setForm({ ...form, is_member_of_assoc: e.target.checked })} />
                  Association Member
                </label>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Current Profession (optional)</label>
              <Input value={form.current_profession} onChange={(e) => setForm({ ...form, current_profession: e.target.value })} placeholder="e.g. Software Engineer" />
            </div>
            <div>
              <label className="text-sm font-medium">Higher Education (optional)</label>
              <Input value={form.higher_education} onChange={(e) => setForm({ ...form, higher_education: e.target.value })} placeholder="e.g. BSc, BUET" />
            </div>
            <Button className="w-full" disabled={createMutation.isPending || !form.student_id} onClick={() => createMutation.mutate()}>
              {createMutation.isPending ? "Creating..." : "Create Profile"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Profile Dialog */}
      <Dialog open={!!editProfile} onOpenChange={(o) => { if (!o) setEditProfile(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Alumni Profile — {editProfile?.student.name_en}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Graduation Year</label>
              <select className="w-full mt-1 border rounded-md px-3 py-2 text-sm" value={editProfile?.graduation_year ?? ""} onChange={(e) => setEditProfile((p) => p ? { ...p, graduation_year: Number(e.target.value) } : null)}>
                {years.map((y) => <option key={y} value={String(y)}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">Current Profession</label>
              <Input value={editProfile?.current_profession ?? ""} onChange={(e) => setEditProfile((p) => p ? { ...p, current_profession: e.target.value } : null)} placeholder="e.g. Doctor" />
            </div>
            <div>
              <label className="text-sm font-medium">Higher Education</label>
              <Input value={editProfile?.higher_education ?? ""} onChange={(e) => setEditProfile((p) => p ? { ...p, higher_education: e.target.value } : null)} placeholder="e.g. MBBS, DMC" />
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={editProfile?.is_member_of_assoc ?? false} onChange={(e) => setEditProfile((p) => p ? { ...p, is_member_of_assoc: e.target.checked } : null)} />
              Association Member
            </label>
            <Button className="w-full" disabled={updateMutation.isPending} onClick={() => editProfile && updateMutation.mutate(editProfile.student.id)}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
