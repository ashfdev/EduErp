"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper, PageHeader, Card, CardContent, Button, Badge,
  Dialog, DialogContent, DialogHeader, DialogTitle,
  Input, EmptyState, Table, TableHeader, TableBody, TableRow,
  TableHead, TableCell, ErrorState, LoadingSpinner, extractErrorMessage, ConfirmDialog,
} from "@education-erp/ui";
import { api } from "@/lib/api";

interface StudentOption { id: string; name_en: string; student_uid: string; status: string; }
interface SiblingGroup {
  id: string;
  auto_waiver_percentage: number;
  created_at: string;
  students: { id: string; name_en: string; student_uid: string; current_class: { name_en: string } | null; current_section: { name: string } | null; }[];
}

export default function SiblingGroupsPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [waiver, setWaiver] = useState("0");

  const { data: groups, isLoading, isError, error, refetch } = useQuery<SiblingGroup[]>({
    queryKey: ["sibling-groups"],
    queryFn: async () => (await api.get("/api/sibling-groups")).data.data,
  });

  const { data: students } = useQuery<StudentOption[]>({
    queryKey: ["students-mini", studentSearch],
    queryFn: async () => (await api.get("/api/students", { params: { search: studentSearch || undefined, limit: 30, status: "ACTIVE" } })).data.data,
    enabled: showCreate,
  });

  const createMutation = useMutation({
    mutationFn: () => api.post("/api/sibling-groups", { student_ids: selectedStudentIds, auto_waiver_percentage: Number(waiver) }),
    onSuccess: () => {
      toast.success("Sibling group created");
      qc.invalidateQueries({ queryKey: ["sibling-groups"] });
      setShowCreate(false);
      setSelectedStudentIds([]);
      setWaiver("0");
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/sibling-groups/${id}`),
    onSuccess: () => {
      toast.success("Group dissolved");
      qc.invalidateQueries({ queryKey: ["sibling-groups"] });
      setDeleteId(null);
      if (selectedGroupId === deleteId) setSelectedGroupId(null);
    },
    onError: (err) => toast.error(extractErrorMessage(err)),
  });

  const toggleStudent = (id: string) =>
    setSelectedStudentIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const selectedGroup = groups?.find((g) => g.id === selectedGroupId);

  return (
    <PageWrapper>
      <PageHeader
        title="Sibling Groups"
        subtitle="Group siblings together to apply automatic fee discounts"
        breadcrumbs={[{ label: "Students", href: "/students" }, { label: "Sibling Groups" }]}
        action={<Button size="sm" onClick={() => setShowCreate(true)}>+ Create Group</Button>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Group list */}
        <div className="lg:col-span-1">
          {isLoading ? (
            <div className="flex justify-center py-8"><LoadingSpinner /></div>
          ) : isError ? (
            <ErrorState title="Failed" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
          ) : !groups?.length ? (
            <EmptyState title="No sibling groups" description="Create a group to link siblings and apply automatic fee discounts." />
          ) : (
            <Card>
              <CardContent className="pt-0 p-0">
                <div className="divide-y">
                  {groups.map((g) => (
                    <button key={g.id} onClick={() => setSelectedGroupId(g.id)}
                      className={`w-full text-left px-4 py-3 hover:bg-accent/50 transition-colors ${selectedGroupId === g.id ? "bg-accent" : ""}`}>
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium">{g.students.length} siblings</div>
                        {g.auto_waiver_percentage > 0 && <Badge variant="outline">{g.auto_waiver_percentage}% waiver</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {g.students.map((s) => s.name_en).join(", ")}
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Group detail */}
        <div className="lg:col-span-2">
          {!selectedGroup ? (
            <EmptyState title="Select a group" description="Click on a sibling group to view its members." />
          ) : (
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="font-semibold">Group Members ({selectedGroup.students.length})</div>
                    {selectedGroup.auto_waiver_percentage > 0 && (
                      <div className="text-sm text-muted-foreground">Auto fee waiver: {selectedGroup.auto_waiver_percentage}%</div>
                    )}
                  </div>
                  <Button size="sm" variant="destructive" onClick={() => setDeleteId(selectedGroup.id)}>Dissolve Group</Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>UID</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Section</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedGroup.students.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.name_en}</TableCell>
                        <TableCell className="font-mono text-xs">{s.student_uid}</TableCell>
                        <TableCell>{s.current_class?.name_en ?? "—"}</TableCell>
                        <TableCell>{s.current_section?.name ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Create Group Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Create Sibling Group</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Auto Waiver Percentage (%)</label>
              <Input type="number" min="0" max="100" value={waiver} onChange={(e) => setWaiver(e.target.value)} placeholder="0 = no auto discount" />
            </div>
            <div>
              <label className="text-sm font-medium">Search & Select Students (min. 2)</label>
              <Input value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} placeholder="Search by name or UID..." className="mt-1" />
              <div className="mt-2 border rounded-md max-h-48 overflow-y-auto divide-y">
                {students?.map((s) => (
                  <label key={s.id} className="flex items-center gap-3 px-3 py-2 hover:bg-accent/50 cursor-pointer">
                    <input type="checkbox" checked={selectedStudentIds.includes(s.id)} onChange={() => toggleStudent(s.id)} />
                    <div>
                      <div className="text-sm font-medium">{s.name_en}</div>
                      <div className="text-xs text-muted-foreground">{s.student_uid}</div>
                    </div>
                  </label>
                ))}
              </div>
              {selectedStudentIds.length > 0 && (
                <p className="text-xs text-primary mt-1">{selectedStudentIds.length} student(s) selected</p>
              )}
            </div>
            <Button className="w-full" disabled={createMutation.isPending || selectedStudentIds.length < 2} onClick={() => createMutation.mutate()}>
              {createMutation.isPending ? "Creating..." : `Create Group (${selectedStudentIds.length} selected)`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(o) => { if (!o) setDeleteId(null); }}
        title="Dissolve Sibling Group?"
        description="This will unlink all members. The students themselves are not affected. This cannot be undone."
        confirmLabel="Dissolve"
        destructive
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        loading={deleteMutation.isPending}
      />
    </PageWrapper>
  );
}
