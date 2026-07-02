"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, EmptyState } from "@education-erp/ui";
import { api } from "@/lib/api";

interface GalleryImage {
  id: string;
  image_url: string;
  caption: string | null;
}
interface Album {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  images: GalleryImage[];
}

export default function GalleryAlbumDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<FileList | null>(null);

  const { data: album } = useQuery<Album>({ queryKey: ["website", "gallery", "album", id], queryFn: async () => (await api.get(`/api/website/gallery/albums/${id}`)).data.data });

  const uploadMutation = useMutation({
    mutationFn: () => {
      const form = new FormData();
      if (files) Array.from(files).forEach((f) => form.append("images", f));
      return api.post(`/api/website/gallery/albums/${id}/images`, form, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: (res) => {
      toast.success(`Uploaded ${res.data.data.uploaded} photo(s)`);
      queryClient.invalidateQueries({ queryKey: ["website", "gallery", "album", id] });
      setFiles(null);
    },
    onError: () => toast.error("Upload failed"),
  });

  const deleteImageMutation = useMutation({
    mutationFn: (imageId: string) => api.delete(`/api/website/gallery/images/${imageId}`),
    onSuccess: () => {
      toast.success("Photo removed");
      queryClient.invalidateQueries({ queryKey: ["website", "gallery", "album", id] });
    },
  });

  if (!album) return <PageWrapper><p className="text-sm text-muted-foreground">Loading...</p></PageWrapper>;

  return (
    <PageWrapper>
      <PageHeader title={album.name} breadcrumbs={[{ label: "Website" }, { label: "Gallery", href: "/website/gallery" }, { label: album.name }]} />
      <p className="text-sm text-muted-foreground">{album.description}</p>

      <div className="flex items-center gap-2">
        <Input type="file" accept="image/*" multiple onChange={(e) => setFiles(e.target.files)} />
        <Button disabled={!files?.length || uploadMutation.isPending} onClick={() => uploadMutation.mutate()}>
          {uploadMutation.isPending ? "Uploading..." : "Upload Photos"}
        </Button>
      </div>

      {!album.images.length && <EmptyState title="No photos yet" />}
      <div className="grid grid-cols-4 gap-3">
        {album.images.map((img) => (
          <Card key={img.id} className="group relative overflow-hidden">
            <CardContent className="p-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.image_url} alt={img.caption ?? ""} className="h-32 w-full object-cover" />
              <Button
                size="sm"
                variant="destructive"
                className="absolute right-1 top-1 opacity-0 group-hover:opacity-100"
                onClick={() => deleteImageMutation.mutate(img.id)}
              >
                ×
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </PageWrapper>
  );
}
