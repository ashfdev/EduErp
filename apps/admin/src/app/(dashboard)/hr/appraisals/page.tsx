"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, EmptyState, Input, Label, PageHeader, PageWrapper, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";

interface Criterion { key: string; label: string; max_score: number }
interface Template { id: string; name: string; criteria: Criterion[] }
interface Review {
  id: string;
  review_period: string;
  status: string;
  overall_score: number | null;
  staff: { name_en: string };
  template: Template;
  scores: Record<string, number>;
}
interface StaffOption { id: string; name_en: string }

function slugify(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "criterion";
}

export default function AppraisalsPage() {
  const queryClient = useQueryClient();

  const { data: templates } = useQuery<Template[]>({
    queryKey: ["appraisals", "templates"],
    queryFn: async () => (await api.get("/api/appraisals/templates")).data.data,
  });
  const { data: reviews } = useQuery<Review[]>({
    queryKey: ["appraisals", "reviews"],
    queryFn: async () => (await api.get("/api/appraisals/reviews")).data.data,
  });
  const { data: staff } = useQuery<StaffOption[]>({
    queryKey: ["staff", "list"],
    queryFn: async () => (await api.get("/api/hr/staff", { params: { limit: 100 } })).data.data,
  });

  async function downloadExcel() {
    const res = await api.get("/api/appraisals/reviews/export", { responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Performance_Reviews.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  // Template creation
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [criteria, setCriteria] = useState<Criterion[]>([{ key: "", label: "", max_score: 10 }]);

  const createTemplateMutation = useMutation({
    mutationFn: () => api.post("/api/appraisals/templates", { name: templateName, criteria: criteria.filter((c) => c.label) }),
    onSuccess: () => {
      toast.success("Template created");
      queryClient.invalidateQueries({ queryKey: ["appraisals", "templates"] });
      setTemplateOpen(false);
      setTemplateName("");
      setCriteria([{ key: "", label: "", max_score: 10 }]);
    },
  });

  // Review creation
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewStaffId, setReviewStaffId] = useState("");
  const [reviewTemplateId, setReviewTemplateId] = useState("");
  const [reviewPeriod, setReviewPeriod] = useState("");

  const createReviewMutation = useMutation({
    mutationFn: () => api.post("/api/appraisals/reviews", { staff_id: reviewStaffId, template_id: reviewTemplateId, review_period: reviewPeriod }),
    onSuccess: () => {
      toast.success("Review created");
      queryClient.invalidateQueries({ queryKey: ["appraisals", "reviews"] });
      setReviewOpen(false);
      setReviewStaffId(""); setReviewTemplateId(""); setReviewPeriod("");
    },
  });

  // Score entry
  const [scoreReviewId, setScoreReviewId] = useState<string | null>(null);
  const [scoreDraft, setScoreDraft] = useState<Record<string, number>>({});
  const [comments, setComments] = useState("");
  const scoreReview = reviews?.find((r) => r.id === scoreReviewId);

  const submitScoresMutation = useMutation({
    mutationFn: () => api.put(`/api/appraisals/reviews/${scoreReviewId}/submit`, { scores: scoreDraft, overall_comments: comments }),
    onSuccess: () => {
      toast.success("Scores submitted");
      queryClient.invalidateQueries({ queryKey: ["appraisals", "reviews"] });
      setScoreReviewId(null);
      setScoreDraft({});
      setComments("");
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to submit"),
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Staff Appraisals"
        breadcrumbs={[{ label: "HR", href: "/hr" }, { label: "Appraisals" }]}
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={downloadExcel}>Export Excel</Button>
            <Button variant="outline" onClick={() => setTemplateOpen(true)}>+ New Template</Button>
            <Button onClick={() => setReviewOpen(true)} disabled={!templates?.length}>+ New Review</Button>
          </div>
        }
      />

      {!reviews?.length && <EmptyState title="No reviews yet" />}
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reviews?.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.staff.name_en}</TableCell>
                  <TableCell>{r.review_period}</TableCell>
                  <TableCell>{r.template.name}</TableCell>
                  <TableCell>{r.overall_score ?? "—"}</TableCell>
                  <TableCell><Badge variant={r.status === "ACKNOWLEDGED" ? "default" : "outline"}>{r.status}</Badge></TableCell>
                  <TableCell>
                    {r.status === "DRAFT" && (
                      <Button size="sm" variant="outline" onClick={() => { setScoreReviewId(r.id); setScoreDraft({}); setComments(""); }}>
                        Score
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Appraisal Template</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="e.g. Annual Teaching Review" /></div>
            <Label>Criteria</Label>
            {criteria.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  placeholder="Criterion label"
                  value={c.label}
                  onChange={(e) => setCriteria((prev) => prev.map((p, idx) => (idx === i ? { ...p, label: e.target.value, key: slugify(e.target.value) } : p)))}
                />
                <Input
                  type="number"
                  className="w-24"
                  placeholder="Max"
                  value={c.max_score}
                  onChange={(e) => setCriteria((prev) => prev.map((p, idx) => (idx === i ? { ...p, max_score: Number(e.target.value) } : p)))}
                />
                <Button variant="outline" size="sm" onClick={() => setCriteria((prev) => prev.filter((_, idx) => idx !== i))}>Remove</Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setCriteria((prev) => [...prev, { key: "", label: "", max_score: 10 }])}>+ Add Criterion</Button>
          </div>
          <DialogFooter>
            <Button onClick={() => createTemplateMutation.mutate()} disabled={createTemplateMutation.isPending || !templateName || !criteria.some((c) => c.label)}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Review</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Staff</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={reviewStaffId} onChange={(e) => setReviewStaffId(e.target.value)}>
                <option value="">Select...</option>
                {staff?.map((s) => <option key={s.id} value={s.id}>{s.name_en}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Template</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={reviewTemplateId} onChange={(e) => setReviewTemplateId(e.target.value)}>
                <option value="">Select...</option>
                {templates?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5"><Label>Review Period</Label><Input value={reviewPeriod} onChange={(e) => setReviewPeriod(e.target.value)} placeholder="e.g. 2026 Annual" /></div>
          </div>
          <DialogFooter>
            <Button onClick={() => createReviewMutation.mutate()} disabled={createReviewMutation.isPending || !reviewStaffId || !reviewTemplateId || !reviewPeriod}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!scoreReviewId} onOpenChange={(o) => !o && setScoreReviewId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Score — {scoreReview?.staff.name_en}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {scoreReview?.template.criteria.map((c) => (
              <div key={c.key} className="space-y-1.5">
                <Label>{c.label} (max {c.max_score})</Label>
                <Input
                  type="number"
                  min={0}
                  max={c.max_score}
                  value={scoreDraft[c.key] ?? ""}
                  onChange={(e) => setScoreDraft((prev) => ({ ...prev, [c.key]: Number(e.target.value) }))}
                />
              </div>
            ))}
            <div className="space-y-1.5"><Label>Overall Comments</Label><Input value={comments} onChange={(e) => setComments(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button onClick={() => submitScoresMutation.mutate()} disabled={submitScoresMutation.isPending}>Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
