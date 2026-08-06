"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { TeacherShell } from "@/components/teacher-shell";
import { Badge, Button, Card, CardContent, Checkbox, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, EmptyState, Input, Label, PageHeader, PageWrapper, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";

interface MySection { class_id: string; class_name: string; section_id: string; section_name: string }
interface ClassOption { id: string; name_en: string }
interface Subject { id: string; name_en: string }
interface Question { id: string; question_text: string; options: { key: string; text: string }[]; correct_option: string; marks: number }
interface QuizRow { id: string; title: string; duration_minutes: number; is_published: boolean; _count: { questions: number; attempts: number } }
interface Attempt { id: string; status: string; score: number | null; tamper_flag_count: number; student: { name_en: string; student_uid: string } }

function slugKey(text: string): string {
  return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 20) || "opt";
}

export default function TeacherQuizzesPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const queryClient = useQueryClient();
  const t = useTranslations("quizzes");
  const [subjectId, setSubjectId] = useState("");

  const { data: mySections } = useQuery<MySection[]>({
    queryKey: ["teacher", "my-sections"],
    queryFn: async () => (await api.get("/api/teacher/my-sections")).data.data,
    enabled: !isAdmin,
  });
  const { data: allClasses } = useQuery<ClassOption[]>({
    queryKey: ["settings", "classes"],
    queryFn: async () => (await api.get("/api/settings/classes")).data.data,
    enabled: isAdmin,
  });
  const classIds = isAdmin
    ? (allClasses ?? []).map((c) => c.id)
    : [...new Set((mySections ?? []).map((s) => s.class_id))];

  const { data: subjects } = useQuery<Subject[]>({
    queryKey: ["subjects", "for-quiz", classIds.join(","), isAdmin],
    queryFn: async () => {
      // Non-admin teachers only get offered subjects they're actually
      // assigned to (assigned_only=true) — admin/oversight roles keep
      // seeing every subject in the class, unfiltered, as before.
      const results = await Promise.all(
        classIds.map((cid) => api.get("/api/subjects", { params: { class_id: cid, ...(isAdmin ? {} : { assigned_only: true }) } })),
      );
      return results.flatMap((r) => r.data.data);
    },
    enabled: classIds.length > 0,
  });

  const { data: questions } = useQuery<Question[]>({
    queryKey: ["quizzes", "questions", subjectId],
    queryFn: async () => (await api.get("/api/quizzes/questions", { params: { subject_id: subjectId } })).data.data,
    enabled: !!subjectId,
  });
  const { data: quizzes } = useQuery<QuizRow[]>({
    queryKey: ["quizzes", "quizzes", subjectId],
    queryFn: async () => (await api.get("/api/quizzes/quizzes", { params: { subject_id: subjectId } })).data.data,
    enabled: !!subjectId,
  });

  // Question creation
  const [qOpen, setQOpen] = useState(false);
  const [qText, setQText] = useState("");
  const [qOptions, setQOptions] = useState([{ key: "a", text: "" }, { key: "b", text: "" }]);
  const [qCorrect, setQCorrect] = useState("a");
  const [qMarks, setQMarks] = useState(1);

  const createQuestionMutation = useMutation({
    mutationFn: () => api.post("/api/quizzes/questions", { subject_id: subjectId, question_text: qText, options: qOptions, correct_option: qCorrect, marks: qMarks }),
    onSuccess: () => {
      toast.success(t("questionAdded"));
      queryClient.invalidateQueries({ queryKey: ["quizzes", "questions", subjectId] });
      setQOpen(false);
      setQText(""); setQOptions([{ key: "a", text: "" }, { key: "b", text: "" }]); setQCorrect("a"); setQMarks(1);
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? t("questionAddFailed")),
  });

  // Quiz creation
  const [quizOpen, setQuizOpen] = useState(false);
  const [quizTitle, setQuizTitle] = useState("");
  const [duration, setDuration] = useState(15);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set());

  const createQuizMutation = useMutation({
    mutationFn: () => api.post("/api/quizzes/quizzes", { subject_id: subjectId, title: quizTitle, duration_minutes: duration, question_ids: [...selectedQuestionIds] }),
    onSuccess: () => {
      toast.success(t("quizCreated"));
      queryClient.invalidateQueries({ queryKey: ["quizzes", "quizzes", subjectId] });
      setQuizOpen(false);
      setQuizTitle(""); setDuration(15); setSelectedQuestionIds(new Set());
    },
  });

  const publishMutation = useMutation({
    mutationFn: (quizId: string) => api.put(`/api/quizzes/quizzes/${quizId}/publish`),
    onSuccess: () => {
      toast.success(t("quizPublished"));
      queryClient.invalidateQueries({ queryKey: ["quizzes", "quizzes", subjectId] });
    },
  });

  // Results
  const [resultsQuizId, setResultsQuizId] = useState<string | null>(null);
  const { data: attempts } = useQuery<Attempt[]>({
    queryKey: ["quizzes", "attempts", resultsQuizId],
    queryFn: async () => (await api.get(`/api/quizzes/quizzes/${resultsQuizId}/attempts`)).data.data,
    enabled: !!resultsQuizId,
  });

  return (
    <TeacherShell>
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-primary to-blue-500 p-8 text-white shadow-xl shadow-indigo-200">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 h-40 w-40 rounded-full bg-white/10 blur-3xl"></div>
        <div className="absolute bottom-0 left-10 -mb-10 h-32 w-32 rounded-full bg-blue-400/20 blur-2xl"></div>
        
        <div className="relative z-10 flex flex-col">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            {t("title")}
          </h1>
          <p className="mt-1 text-indigo-100 font-medium opacity-90">
            {t("subtitle")}
          </p>
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <Label className="text-sm font-bold text-slate-500 uppercase">{t("subject")}</Label>
            <select className="flex-1 max-w-sm rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/50" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">{t("selectSubject")}</option>
              {subjects?.map((s) => <option key={s.id} value={s.id}>{s.name_en}</option>)}
            </select>
          </div>
        </div>

        {subjectId && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Questions Bank */}
            <div className="rounded-3xl border border-slate-100 bg-white shadow-sm overflow-hidden flex flex-col">
              <div className="flex items-center justify-between border-b border-slate-50 bg-slate-50/50 px-6 py-4">
                <h2 className="text-base font-bold text-slate-800">
                  {t("questionBank", { count: questions?.length ?? 0 })}
                </h2>
                <button 
                  onClick={() => setQOpen(true)}
                  className="text-xs font-bold bg-white border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
                >
                  + {t("addQuestion")}
                </button>
              </div>
              <div className="p-4 flex-1 overflow-y-auto max-h-[600px]">
                {!questions?.length && (
                  <div className="py-8"><EmptyState title={t("noQuestions")} /></div>
                )}
                <div className="space-y-3">
                  {questions?.map((q) => (
                    <div key={q.id} className="rounded-2xl border border-slate-100 p-4 transition-all hover:border-primary/20 hover:bg-slate-50">
                      <p className="font-bold text-slate-800 text-sm">
                        {q.question_text} <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md ml-1">{q.marks} marks</span>
                      </p>
                      <p className="text-xs font-medium text-slate-500 mt-2">
                        {q.options.map((o) => `${o.key}) ${o.text}`).join(" • ")}
                      </p>
                      <p className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md inline-block mt-2">
                        {t("correctLabel", { option: q.correct_option })}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Quizzes */}
            <div className="rounded-3xl border border-slate-100 bg-white shadow-sm overflow-hidden flex flex-col">
              <div className="flex items-center justify-between border-b border-slate-50 bg-slate-50/50 px-6 py-4">
                <h2 className="text-base font-bold text-slate-800">
                  {t("quizzesLabel")}
                </h2>
                <button 
                  onClick={() => setQuizOpen(true)}
                  disabled={!questions?.length}
                  className="text-xs font-bold bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  + {t("createQuiz")}
                </button>
              </div>
              <div className="p-4 flex-1 overflow-y-auto max-h-[600px]">
                {!quizzes?.length && (
                  <div className="py-8"><EmptyState title={t("noQuizzes")} /></div>
                )}
                <div className="space-y-3">
                  {quizzes?.map((q) => (
                    <div key={q.id} className="flex flex-col sm:flex-row sm:items-center justify-between rounded-2xl border border-slate-100 p-4 transition-all hover:border-primary/20 hover:bg-slate-50">
                      <div>
                        <p className="font-bold text-slate-800 text-sm">{q.title}</p>
                        <p className="text-xs font-medium text-slate-500 mt-1">
                          {t("questionsMinAttempts", { questions: q._count.questions, minutes: q.duration_minutes, attempts: q._count.attempts })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 mt-3 sm:mt-0">
                        <Badge variant={q.is_published ? "default" : "outline"} className={q.is_published ? "bg-emerald-500" : "bg-slate-100 text-slate-500"}>
                          {q.is_published ? t("published") : t("draft")}
                        </Badge>
                        {!q.is_published && (
                          <button onClick={() => publishMutation.mutate(q.id)} className="text-xs font-bold text-primary hover:underline px-2 py-1">
                            {t("publish")}
                          </button>
                        )}
                        <button onClick={() => setResultsQuizId(q.id)} className="text-xs font-bold bg-white border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50">
                          {t("results")}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        )}
      </div>

      <Dialog open={qOpen} onOpenChange={setQOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t("addQuestionTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>{t("question")}</Label><Input value={qText} onChange={(e) => setQText(e.target.value)} /></div>
            {qOptions.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  placeholder={t("optionPlaceholder", { key: o.key })}
                  value={o.text}
                  onChange={(e) => setQOptions((prev) => prev.map((p, idx) => (idx === i ? { ...p, text: e.target.value } : p)))}
                />
                <label className="flex items-center gap-1 text-xs">
                  <input type="radio" checked={qCorrect === o.key} onChange={() => setQCorrect(o.key)} /> {t("correct")}
                </label>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => setQOptions((prev) => [...prev, { key: slugKey(`opt${prev.length}`) + prev.length, text: "" }])}>{t("addOption")}</Button>
            <div className="space-y-1.5"><Label>{t("marks")}</Label><Input type="number" className="w-24" value={qMarks} onChange={(e) => setQMarks(Number(e.target.value))} /></div>
          </div>
          <DialogFooter>
            <Button onClick={() => createQuestionMutation.mutate()} disabled={createQuestionMutation.isPending || !qText || qOptions.some((o) => !o.text)}>
              {t("add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={quizOpen} onOpenChange={setQuizOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t("createQuizTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>{t("quizTitle")}</Label><Input value={quizTitle} onChange={(e) => setQuizTitle(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>{t("durationMinutes")}</Label><Input type="number" className="w-24" value={duration} onChange={(e) => setDuration(Number(e.target.value))} /></div>
            <Label>{t("selectQuestions")}</Label>
            <div className="max-h-60 space-y-1 overflow-y-auto">
              {questions?.map((q) => (
                <label key={q.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                  <Checkbox
                    checked={selectedQuestionIds.has(q.id)}
                    onCheckedChange={(v) => setSelectedQuestionIds((prev) => { const next = new Set(prev); if (v) next.add(q.id); else next.delete(q.id); return next; })}
                  />
                  {q.question_text}
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => createQuizMutation.mutate()} disabled={createQuizMutation.isPending || !quizTitle || !selectedQuestionIds.size}>
              {t("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resultsQuizId} onOpenChange={(o) => !o && setResultsQuizId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t("results")}</DialogTitle></DialogHeader>
          {!attempts?.length && <p className="text-sm text-muted-foreground">{t("noAttempts")}</p>}
          <div className="space-y-2">
            {attempts?.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                <span>{a.student.name_en} <span className="font-mono text-xs text-muted-foreground">{a.student.student_uid}</span></span>
                <div className="flex items-center gap-2">
                  {a.tamper_flag_count > 0 && <Badge variant="outline">{t("flagsCount", { count: a.tamper_flag_count })}</Badge>}
                  <Badge variant={a.status === "GRADED" ? "default" : "outline"}>{a.status === "GRADED" ? `${a.score}` : a.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </TeacherShell>
  );
}
