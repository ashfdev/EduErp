"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, Label, EmptyState, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, SearchInput, Switch } from "@education-erp/ui";
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
interface BooksResponse {
  data: Book[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export default function BookCatalogPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [category, setCategory] = useState("");
  const [isbn, setIsbn] = useState("");
  const [totalCopies, setTotalCopies] = useState(1);
  const [location, setLocation] = useState("");

  const { data: categories } = useQuery<string[]>({
    queryKey: ["library", "books", "categories"],
    queryFn: async () => (await api.get("/api/library/books/categories")).data.data,
  });

  const { data: booksResponse } = useQuery<BooksResponse>({
    queryKey: ["library", "books", search, categoryFilter, availableOnly, page],
    queryFn: async () =>
      (
        await api.get("/api/library/books", {
          params: {
            search: search || undefined,
            category: categoryFilter || undefined,
            available_only: availableOnly ? "true" : undefined,
            page,
            limit: 20,
          },
        })
      ).data,
  });
  const books = booksResponse?.data;
  const meta = booksResponse?.meta;

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

      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          placeholder="Search by title, author, or ISBN..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="max-w-sm"
        />
        <select
          className="rounded-md border px-3 py-2 text-sm"
          value={categoryFilter}
          onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
        >
          <option value="">All categories</option>
          {categories?.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={availableOnly} onCheckedChange={(v) => { setAvailableOnly(v); setPage(1); }} />
          Available only
        </label>
        {meta && <span className="text-xs text-muted-foreground">{meta.total} book{meta.total === 1 ? "" : "s"}</span>}
      </div>

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

            {meta && meta.totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <span className="text-sm text-muted-foreground">Page {meta.page} of {meta.totalPages}</span>
                <Button size="sm" variant="outline" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            )}
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
