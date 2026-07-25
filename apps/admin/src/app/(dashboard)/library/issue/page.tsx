"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@education-erp/ui";
import { api } from "@/lib/api";

interface StudentRow {
  id: string;
  name_en: string;
  student_uid: string;
}
interface BookRow {
  id: string;
  title: string;
  author: string;
  available: number;
}
interface ClassOption {
  id: string;
  name_en: string;
  sections?: { id: string; name: string }[];
}

export default function IssueBookPage() {
  const [personSearch, setPersonSearch] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<StudentRow | null>(null);
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [bookSearch, setBookSearch] = useState("");
  const [selectedBook, setSelectedBook] = useState<BookRow | null>(null);
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });

  const { data: classes } = useQuery<ClassOption[]>({
    queryKey: ["settings", "classes"],
    queryFn: async () => (await api.get("/api/settings/classes")).data.data,
  });
  const selectedClass = classes?.find((c) => c.id === classId);

  const { data: students } = useQuery<StudentRow[]>({
    queryKey: ["students", "search", personSearch, classId, sectionId],
    queryFn: async () =>
      (
        await api.get("/api/students", {
          params: { search: personSearch, class_id: classId || undefined, section_id: sectionId || undefined, limit: 5 },
        })
      ).data.data,
    enabled: personSearch.length > 1 && !selectedPerson,
  });

  const { data: books } = useQuery<BookRow[]>({
    queryKey: ["library", "books", "search", bookSearch],
    queryFn: async () => (await api.get("/api/library/books", { params: { search: bookSearch, available_only: "true", limit: 5 } })).data.data,
    enabled: bookSearch.length > 1 && !selectedBook,
  });

  const issueMutation = useMutation({
    mutationFn: () =>
      api.post("/api/library/issues/issue", { book_id: selectedBook!.id, person_id: selectedPerson!.id, person_type: "STUDENT", due_date: dueDate }),
    onSuccess: () => {
      toast.success("Book issued");
      setSelectedPerson(null);
      setSelectedBook(null);
      setPersonSearch("");
      setBookSearch("");
      setClassId("");
      setSectionId("");
    },
    onError: () => toast.error("Failed to issue book"),
  });

  return (
    <PageWrapper>
      <PageHeader title="Issue Book" breadcrumbs={[{ label: "Library", href: "/library" }, { label: "Issue" }]} />

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="space-y-2 pt-6">
            <Label>Student</Label>
            {selectedPerson ? (
              <div className="flex items-center justify-between rounded-md border p-2 text-sm">
                <span>{selectedPerson.name_en} ({selectedPerson.student_uid})</span>
                <Button size="sm" variant="outline" onClick={() => setSelectedPerson(null)}>Change</Button>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <Select value={classId || "all"} onValueChange={(v) => { setClassId(v === "all" ? "" : v); setSectionId(""); }}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="All Classes" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Classes</SelectItem>
                      {classes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name_en}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={sectionId || "all"} onValueChange={(v) => setSectionId(v === "all" ? "" : v)}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="All Sections" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sections</SelectItem>
                      {selectedClass?.sections?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Input placeholder="Search student..." value={personSearch} onChange={(e) => setPersonSearch(e.target.value)} />
                {students?.map((s) => (
                  <button key={s.id} onClick={() => setSelectedPerson(s)} className="block w-full rounded-md border p-2 text-left text-sm hover:bg-accent">
                    {s.name_en} <span className="font-mono text-xs text-muted-foreground">{s.student_uid}</span>
                  </button>
                ))}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2 pt-6">
            <Label>Book</Label>
            {selectedBook ? (
              <div className="flex items-center justify-between rounded-md border p-2 text-sm">
                <span>{selectedBook.title} — {selectedBook.author}</span>
                <Button size="sm" variant="outline" onClick={() => setSelectedBook(null)}>Change</Button>
              </div>
            ) : (
              <>
                <Input placeholder="Search book title/author..." value={bookSearch} onChange={(e) => setBookSearch(e.target.value)} />
                {books?.map((b) => (
                  <button key={b.id} onClick={() => setSelectedBook(b)} className="block w-full rounded-md border p-2 text-left text-sm hover:bg-accent">
                    {b.title} — {b.author} <span className="text-xs text-muted-foreground">({b.available} available)</span>
                  </button>
                ))}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex items-end gap-3">
        <div><Label>Due Date</Label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
        <Button disabled={!selectedPerson || !selectedBook || issueMutation.isPending} onClick={() => issueMutation.mutate()}>
          {issueMutation.isPending ? "Issuing..." : "Issue Book"}
        </Button>
      </div>
    </PageWrapper>
  );
}
