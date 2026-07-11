"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PortalShell } from "@/components/portal-shell";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Card, CardContent, Button, Badge, LoadingSpinner } from "@education-erp/ui";

interface QuestionView {
  id: string;
  question_text: string;
  options: { key: string; text: string }[];
  marks: number;
  correct_option?: string;
}
interface AttemptView {
  attempt: { id: string; status: string; score: number | null; answers?: Record<string, string> };
  deadline_at: string;
  questions: QuestionView[];
}

function QuizAttemptContent() {
  const { id: quizId } = useParams<{ id: string }>();
  const { activeStudentId } = useAuthStore();
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const flaggedRef = useRef(false);

  const { data, isLoading, error, refetch } = useQuery<AttemptView>({
    queryKey: ["portal", "quiz-attempt", quizId, activeStudentId],
    queryFn: async () => (await api.get(`/api/portal/quizzes/${quizId}/attempt`, { params: { student_id: activeStudentId } })).data.data,
    enabled: !!activeStudentId,
    retry: false,
  });

  const startMutation = useMutation({
    mutationFn: () => api.post(`/api/portal/quizzes/${quizId}/start`, { student_id: activeStudentId }),
    onSuccess: () => refetch(),
  });

  const submitMutation = useMutation({
    mutationFn: () => api.post(`/api/portal/quizzes/attempts/${data?.attempt.id}/submit`, { answers }),
    onSuccess: () => {
      toast.success("Quiz submitted");
      queryClient.invalidateQueries({ queryKey: ["portal", "quiz-attempt", quizId, activeStudentId] });
    },
  });

  const submitRef = useRef(submitMutation);
  submitRef.current = submitMutation;

  // Countdown, ticking from the server-computed deadline (not a fresh local
  // timer) so a page refresh mid-attempt doesn't grant extra time.
  useEffect(() => {
    if (!data || data.attempt.status !== "IN_PROGRESS") return;
    const deadline = new Date(data.deadline_at).getTime();
    const tick = () => {
      const remaining = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0 && !submitRef.current.isPending && !submitRef.current.isSuccess) {
        submitRef.current.mutate();
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [data]);

  // Moderate anti-cheat: log tab-switch/window-blur (not blocked, just
  // flagged for the teacher to review), and disable copy/paste.
  const flag = useCallback(
    (type: "TAB_SWITCH" | "WINDOW_BLUR") => {
      if (!data || data.attempt.status !== "IN_PROGRESS") return;
      api.put(`/api/portal/quizzes/attempts/${data.attempt.id}/flag`, { type }).catch(() => {});
    },
    [data],
  );

  useEffect(() => {
    if (!data || data.attempt.status !== "IN_PROGRESS") return;
    const onVisibility = () => { if (document.hidden) flag("TAB_SWITCH"); };
    const onBlur = () => flag("WINDOW_BLUR");
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
    };
  }, [data, flag]);

  if (isLoading) return <div className="flex min-h-[50vh] items-center justify-center"><LoadingSpinner /></div>;

  if (error) {
    return (
      <div className="p-4 text-center">
        <p className="mb-3 text-sm text-gray-500">You haven&apos;t started this quiz yet.</p>
        <Button onClick={() => startMutation.mutate()} disabled={startMutation.isPending}>Start Quiz</Button>
      </div>
    );
  }

  if (!data) return null;

  const finished = data.attempt.status !== "IN_PROGRESS";

  if (finished) {
    return (
      <div className="space-y-3 p-4" onCopy={(e) => e.preventDefault()}>
        <h1 className="text-lg font-semibold">Results</h1>
        <Card><CardContent className="pt-6"><p className="text-2xl font-semibold">{data.attempt.score}</p><p className="text-xs text-gray-500">Total Score</p></CardContent></Card>
        {data.questions.map((q) => {
          const given = data.attempt.answers?.[q.id];
          const correct = given === q.correct_option;
          return (
            <Card key={q.id}>
              <CardContent className="pt-6">
                <p className="font-medium">{q.question_text}</p>
                <p className="mt-1 text-sm">
                  Your answer: {given ?? "—"} <Badge variant={correct ? "default" : "outline"}>{correct ? "Correct" : "Incorrect"}</Badge>
                </p>
                {!correct && <p className="text-xs text-gray-500">Correct answer: {q.correct_option}</p>}
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  }

  const minutes = secondsLeft !== null ? Math.floor(secondsLeft / 60) : 0;
  const seconds = secondsLeft !== null ? secondsLeft % 60 : 0;

  return (
    <div
      className="space-y-3 p-4"
      onCopy={(e) => e.preventDefault()}
      onPaste={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between rounded-md bg-white p-2 shadow-sm">
        <h1 className="text-lg font-semibold">Quiz in Progress</h1>
        <Badge variant={secondsLeft !== null && secondsLeft < 60 ? "outline" : "default"}>{minutes}:{String(seconds).padStart(2, "0")}</Badge>
      </div>

      {data.questions.map((q, i) => (
        <Card key={q.id}>
          <CardContent className="pt-6">
            <p className="font-medium">{i + 1}. {q.question_text} <span className="text-xs text-gray-400">({q.marks} marks)</span></p>
            <div className="mt-2 space-y-1">
              {q.options.map((o) => (
                <label key={o.key} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={q.id}
                    checked={answers[q.id] === o.key}
                    onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: o.key }))}
                  />
                  {o.text}
                </label>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      <Button className="w-full" onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}>
        {submitMutation.isPending ? "Submitting..." : "Submit Quiz"}
      </Button>
    </div>
  );
}

export default function QuizAttemptPage() {
  return (
    <PortalShell>
      <QuizAttemptContent />
    </PortalShell>
  );
}
