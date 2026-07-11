import { z } from "zod";

export const gradeSubmissionSchema = z.object({
  grade: z.number().min(0),
  feedback: z.string().optional().nullable(),
});
export type GradeSubmissionInput = z.infer<typeof gradeSubmissionSchema>;
