"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper,
  PageHeader,
  Card,
  CardContent,
  Button,
  Badge,
  Label,
  Input,
  Textarea,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  EmptyState,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@education-erp/ui";
import { api } from "@/lib/api";

interface JobPosting {
  id: string;
  title: string;
  department: string | null;
  description: string;
  requirements: string | null;
  deadline: string | null;
  is_published: boolean;
  created_at: string;
}

const emptyForm = { title: "", department: "", description: "", requirements: "", deadline: "" };

export default function JobPostingsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: jobs } = useQuery<JobPosting[]>({
    queryKey: ["hr", "jobs"],
    queryFn: async () => (await api.get("/api/hr/jobs")).data.data,
  });

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setOpen(true);
  }
  function openEdit(job: JobPosting) {
    setEditingId(job.id);
    setForm({
      title: job.title,
      department: job.department ?? "",
      description: job.description,
      requirements: job.requirements ?? "",
      deadline: job.deadline ? job.deadline.slice(0, 10) : "",
    });
    setOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        department: form.department || undefined,
        requirements: form.requirements || undefined,
        deadline: form.deadline || undefined,
      };
      return editingId ? api.put(`/api/hr/jobs/${editingId}`, payload) : api.post("/api/hr/jobs", payload);
    },
    onSuccess: () => {
      toast.success(editingId ? "Job posting updated" : "Job posting created");
      queryClient.invalidateQueries({ queryKey: ["hr", "jobs"] });
      setOpen(false);
      setForm(emptyForm);
    },
    onError: () => toast.error(editingId ? "Failed to update job posting" : "Failed to create job posting"),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_published }: { id: string; is_published: boolean }) => api.put(`/api/hr/jobs/${id}/toggle`, { is_published }),
    onSuccess: () => {
      toast.success("Updated");
      queryClient.invalidateQueries({ queryKey: ["hr", "jobs"] });
    },
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Job Postings"
        subtitle="Manage openings and review applicants"
        breadcrumbs={[{ label: "HR" }, { label: "Job Postings" }]}
        action={<Button onClick={openCreate}>+ New Posting</Button>}
      />

      <Card>
        <CardContent className="pt-6">
          {!jobs?.length && <EmptyState title="No job postings yet" />}
          {!!jobs?.length && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Deadline</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((j) => (
                  <TableRow key={j.id}>
                    <TableCell className="font-medium">
                      <Link href={`/hr/jobs/${j.id}`} className="hover:underline">{j.title}</Link>
                    </TableCell>
                    <TableCell>{j.department ?? "-"}</TableCell>
                    <TableCell>{j.deadline ? new Date(j.deadline).toLocaleDateString() : "-"}</TableCell>
                    <TableCell>
                      {j.is_published ? <Badge variant="success">Published</Badge> : <Badge variant="outline">Draft</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => openEdit(j)}>Edit</Button>{" "}
                      <Button size="sm" variant="outline" onClick={() => toggleMutation.mutate({ id: j.id, is_published: !j.is_published })}>
                        {j.is_published ? "Unpublish" : "Publish"}
                      </Button>{" "}
                      <Link href={`/hr/jobs/${j.id}`}>
                        <Button size="sm" variant="outline">Applicants</Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? "Edit Job Posting" : "New Job Posting"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Department (optional)</Label><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} /></div>
            <div className="space-y-1.5"><Label>Requirements (optional)</Label><Textarea value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })} rows={3} /></div>
            <div className="space-y-1.5"><Label>Deadline (optional)</Label><Input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.title || !form.description}>
              {saveMutation.isPending ? "Saving..." : editingId ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
