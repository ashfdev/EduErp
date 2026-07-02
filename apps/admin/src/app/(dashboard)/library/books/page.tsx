"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, Label, EmptyState, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@education-erp/ui";
import { api } from "@/lib/api";

interface Book {
  id: string;
  title: string;
  author: string;
  category: string;
  isbn: string | null;
  total_copies: number;
  available: number;
  location: string | null;
}

export default function BookCatalogPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [category, setCategory] = useState("");
  const [isbn, setIsbn] = useState("");
  const [totalCopies, setTotalCopies] = useState(1);
  const [location, setLocation] = useState("");

  const { data: books } = useQuery<Book[]>({
    queryKey: ["library", "books", search],
    queryFn: async () => (await api.get("/api/library/books", { params: { search: search || undefined, limit: 100 } })).data.data,
  });

  const createMutation = useMutation({
    mutationFn: () => api.post("/api/library/books", { title, author, category, isbn: isbn || undefined, total_copies: totalCopies, location: location || undefined }),
    onSuccess: () => {
      toast.success("Book added");
      queryClient.invalidateQueries({ queryKey: ["library", "books"] });
      setOpen(false);
      setTitle(""); setAuthor(""); setCategory(""); setIsbn(""); setTotalCopies(1); setLocation("");
    },
  });

  const addCopiesMutation = useMutation({
    mutationFn: ({ id, count }: { id: string; count: number }) => api.post(`/api/library/books/${id}/copies`, { count }),
    onSuccess: () => {
      toast.success("Copies added");
      queryClient.invalidateQueries({ queryKey: ["library", "books"] });
    },
  });

  return (
    <PageWrapper>
      <PageHeader title="Book Catalog" breadcrumbs={[{ label: "Library", href: "/library" }, { label: "Books" }]} action={<Button onClick={() => setOpen(true)}>+ Add Book</Button>} />
      <Input placeholder="Search by title, author, or ISBN..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />

      {!books?.length && <EmptyState title="No books found" />}
      {!!books?.length && (
        <Card>
          <CardContent className="pt-6">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">Title</th><th className="p-2">Author</th><th className="p-2">Category</th><th className="p-2">Location</th><th className="p-2">Available</th><th className="p-2">Actions</th></tr></thead>
              <tbody>
                {books.map((b) => (
                  <tr key={b.id} className="border-b">
                    <td className="p-2">{b.title}</td>
                    <td className="p-2">{b.author}</td>
                    <td className="p-2">{b.category}</td>
                    <td className="p-2">{b.location ?? "-"}</td>
                    <td className="p-2">{b.available} / {b.total_copies}</td>
                    <td className="p-2">
                      <Button size="sm" variant="outline" onClick={() => addCopiesMutation.mutate({ id: b.id, count: 1 })}>+1 Copy</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Book</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Author</Label><Input value={author} onChange={(e) => setAuthor(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Category</Label><Input value={category} onChange={(e) => setCategory(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>ISBN</Label><Input value={isbn} onChange={(e) => setIsbn(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Total Copies</Label><Input type="number" min={1} value={totalCopies} onChange={(e) => setTotalCopies(Number(e.target.value))} /></div>
              <div className="space-y-1.5"><Label>Shelf Location</Label><Input value={location} onChange={(e) => setLocation(e.target.value)} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button disabled={!title || !author || !category || createMutation.isPending} onClick={() => createMutation.mutate()}>Add Book</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
