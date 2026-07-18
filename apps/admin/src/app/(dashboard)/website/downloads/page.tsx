"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, Label, StatusBadge, EmptyState, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@education-erp/ui";
import { api } from "@/lib/api";

const CATEGORIES = ["SYLLABUS", "EXAM_SCHEDULE", "CLASS_ROUTINE", "ACADEMIC_CALENDAR", "FORMS", "RESULTS", "CIRCULARS", "OTHERS"];

interface DownloadItem {
  id: string;
  title: string;
  category: string;
  file_name: string;
  is_public: boolean;
  download_count: number;
  created_at: string;
}

export default function DownloadsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("FORMS");
  const [file, setFile] = useState<File | null>(null);

  const { data: downloads } = useQuery<DownloadItem[]>({ queryKey: ["website", "downloads"], queryFn: async () => (await api.get("/api/website/downloads")).data.data });

  const createMutation = useMutation({
    mutationFn: () => {
      const form = new FormData();
      if (file) form.append("file", file);
      form.append("title", title);
      form.append("category", category);
      return api.post("/api/website/downloads", form, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: () => {
      toast.success("File uploaded");
      queryClient.invalidateQueries({ queryKey: ["website", "downloads"] });
      setOpen(false);
      setTitle(""); setFile(null);
    },
    onError: () => toast.error("Upload failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/website/downloads/${id}`),
    onSuccess: () => {
      toast.success("File removed");
      queryClient.invalidateQueries({ queryKey: ["website", "downloads"] });
    },
  });

  return (
    <PageWrapper>
      <PageHeader title="Downloads" breadcrumbs={[{ label: "Website" }, { label: "Downloads" }]} action={<Button onClick={() => setOpen(true)}>+ Upload File</Button>} />

      {!downloads?.length && <EmptyState title="No files uploaded yet" />}
      {!!downloads?.length && (
        <Card>
          <CardContent className="pt-6">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">Title</th><th className="p-2">Category</th><th className="p-2">Visibility</th><th className="p-2">Downloads</th><th className="p-2">Actions</th></tr></thead>
              <tbody>
                {downloads.map((d) => (
                  <tr key={d.id} className="border-b">
                    <td className="p-2">{d.title}</td>
                    <td className="p-2"><StatusBadge status={d.category} /></td>
                    <td className="p-2"><StatusBadge status={d.is_public ? "PUBLIC" : "PRIVATE"} /></td>
                    <td className="p-2">{d.download_count}</td>
                    <td className="p-2"><Button size="sm" variant="destructive" onClick={() => deleteMutation.mutate(d.id)}>Delete</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upload File</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1.5"><Label>File</Label><Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
          </div>
          <DialogFooter>
            <Button disabled={!title || !file || createMutation.isPending} onClick={() => createMutation.mutate()}>
              {createMutation.isPending ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
