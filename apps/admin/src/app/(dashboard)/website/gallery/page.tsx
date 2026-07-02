"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, Label, StatusBadge, EmptyState, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@education-erp/ui";
import { api } from "@/lib/api";

interface Album {
  id: string;
  name: string;
  cover_url: string | null;
  is_public: boolean;
  date: string | null;
  _count: { images: number };
}

export default function GalleryPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const { data: albums } = useQuery<Album[]>({ queryKey: ["website", "gallery", "albums"], queryFn: async () => (await api.get("/api/website/gallery/albums")).data.data });

  const createMutation = useMutation({
    mutationFn: () => api.post("/api/website/gallery/albums", { name, description }),
    onSuccess: () => {
      toast.success("Album created");
      queryClient.invalidateQueries({ queryKey: ["website", "gallery", "albums"] });
      setOpen(false);
      setName(""); setDescription("");
    },
  });

  return (
    <PageWrapper>
      <PageHeader title="Gallery" breadcrumbs={[{ label: "Website" }, { label: "Gallery" }]} action={<Button onClick={() => setOpen(true)}>+ New Album</Button>} />

      {!albums?.length && <EmptyState title="No albums yet" />}
      <div className="grid grid-cols-3 gap-4">
        {albums?.map((a) => (
          <Link key={a.id} href={`/website/gallery/${a.id}`}>
            <Card className="transition hover:shadow-md">
              <CardContent className="space-y-2 pt-6">
                {a.cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.cover_url} alt={a.name} className="h-32 w-full rounded-md object-cover" />
                ) : (
                  <div className="flex h-32 w-full items-center justify-center rounded-md bg-muted text-sm text-muted-foreground">No cover</div>
                )}
                <p className="font-medium">{a.name}</p>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{a._count.images} photos</span>
                  <StatusBadge status={a.is_public ? "PUBLIC" : "PRIVATE"} />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Album</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button disabled={!name || createMutation.isPending} onClick={() => createMutation.mutate()}>Create Album</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
