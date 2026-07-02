"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, Label, EmptyState, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@education-erp/ui";
import { api } from "@/lib/api";

interface Slider {
  id: string;
  image_url: string;
  title: string | null;
  subtitle: string | null;
  is_active: boolean;
  display_order: number;
}

export default function SlidersPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [btnText, setBtnText] = useState("");
  const [btnLink, setBtnLink] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const { data: sliders } = useQuery<Slider[]>({ queryKey: ["website", "sliders"], queryFn: async () => (await api.get("/api/website/sliders")).data.data });

  const createMutation = useMutation({
    mutationFn: () => {
      const form = new FormData();
      if (file) form.append("image", file);
      form.append("title", title);
      form.append("subtitle", subtitle);
      form.append("btn_text", btnText);
      form.append("btn_link", btnLink);
      return api.post("/api/website/sliders", form, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: () => {
      toast.success("Slide added");
      queryClient.invalidateQueries({ queryKey: ["website", "sliders"] });
      setOpen(false);
      setTitle(""); setSubtitle(""); setBtnText(""); setBtnLink(""); setFile(null);
    },
    onError: () => toast.error("Failed to add slide"),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) => api.put(`/api/website/sliders/${id}/toggle`, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["website", "sliders"] }),
  });

  const reorderMutation = useMutation({
    mutationFn: (items: { id: string; display_order: number }[]) => api.put("/api/website/sliders/reorder", items),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["website", "sliders"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/website/sliders/${id}`),
    onSuccess: () => {
      toast.success("Slide removed");
      queryClient.invalidateQueries({ queryKey: ["website", "sliders"] });
    },
  });

  function move(index: number, dir: -1 | 1) {
    if (!sliders) return;
    const arr = [...sliders];
    const target = index + dir;
    if (target < 0 || target >= arr.length) return;
    [arr[index], arr[target]] = [arr[target]!, arr[index]!];
    reorderMutation.mutate(arr.map((s, i) => ({ id: s.id, display_order: i })));
  }

  return (
    <PageWrapper>
      <PageHeader title="Homepage Sliders" breadcrumbs={[{ label: "Website" }, { label: "Sliders" }]} action={<Button onClick={() => setOpen(true)}>+ Add Slide</Button>} />

      {!sliders?.length && <EmptyState title="No slides yet" />}
      <div className="grid grid-cols-2 gap-4">
        {sliders?.map((s, i) => (
          <Card key={s.id}>
            <CardContent className="space-y-2 pt-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.image_url} alt={s.title ?? ""} className="h-32 w-full rounded-md object-cover" />
              <p className="font-medium">{s.title || "(no title)"}</p>
              <p className="text-sm text-muted-foreground">{s.subtitle}</p>
              <div className="flex items-center justify-between">
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => move(i, -1)}>↑</Button>
                  <Button size="sm" variant="outline" onClick={() => move(i, 1)}>↓</Button>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => toggleMutation.mutate({ id: s.id, is_active: !s.is_active })}>
                    {s.is_active ? "Deactivate" : "Activate"}
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => deleteMutation.mutate(s.id)}>Delete</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Slide</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Image</Label><Input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
            <div className="space-y-1.5"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Subtitle</Label><Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Button Text</Label><Input value={btnText} onChange={(e) => setBtnText(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Button Link</Label><Input value={btnLink} onChange={(e) => setBtnLink(e.target.value)} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button disabled={!file || createMutation.isPending} onClick={() => createMutation.mutate()}>
              {createMutation.isPending ? "Uploading..." : "Add Slide"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
