import { z } from "zod";

export const questionOptionSchema = z.object({
  key: z.string().min(1),
  text: z.string().min(1),
});

export const createQuestionSchema = z.object({
  subject_id: z.string().min(1),
  question_text: z.string().min(1),
  options: z.array(questionOptionSchema).min(2),
  correct_option: z.string().min(1),
  marks: z.number().min(0).default(1),
});
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;

export const createQuizSchema = z.object({
  subject_id: z.string().min(1),
  exam_id: z.string().optional().nullable(),
  title: z.string().min(1),
  duration_minutes: z.number().int().min(1),
  question_ids: z.array(z.string()).min(1),
});
export type CreateQuizInput = z.infer<typeof createQuizSchema>;

export const quizAnswerSchema = z.record(z.string(), z.string());

export const submitQuizAttemptSchema = z.object({
  answers: quizAnswerSchema,
});
export type SubmitQuizAttemptInput = z.infer<typeof submitQuizAttemptSchema>;

export const flagQuizAttemptSchema = z.object({
  type: z.enum(["TAB_SWITCH", "WINDOW_BLUR"]),
});
export type FlagQuizAttemptInput = z.infer<typeof flagQuizAttemptSchema>;
