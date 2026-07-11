import { z } from "zod";

export const appraisalCriterionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  max_score: z.number().min(0),
});

export const appraisalTemplateSchema = z.object({
  name: z.string().min(1),
  criteria: z.array(appraisalCriterionSchema).min(1),
});
export type AppraisalTemplateInput = z.infer<typeof appraisalTemplateSchema>;

export const createReviewSchema = z.object({
  staff_id: z.string().min(1),
  template_id: z.string().min(1),
  review_period: z.string().min(1),
});
export type CreateReviewInput = z.infer<typeof createReviewSchema>;

export const submitReviewScoresSchema = z.object({
  scores: z.record(z.string(), z.number().min(0)),
  overall_comments: z.string().optional().nullable(),
});
export type SubmitReviewScoresInput = z.infer<typeof submitReviewScoresSchema>;
