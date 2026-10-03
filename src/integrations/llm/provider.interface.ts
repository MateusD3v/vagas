import { z } from 'zod';

export const llmMatchOutputSchema = z.object({
  scoreAdjustment: z.number().int(),
  matchedSkills: z.array(z.string()),
  missingSkills: z.array(z.string()),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  summary: z.string().min(1),
});

export type LLMMatchOutput = z.infer<typeof llmMatchOutputSchema>;

export interface LLMMatchInput {
  candidate: {
    professionalSummary: string;
    yearsOfExperience: number;
    skills: string[];
    desiredRoles: string[];
  };
  job: {
    title: string;
    description: string;
    skills: string[];
  };
  deterministicScore: number;
}

export interface LLMProvider {
  analyzeJobMatch(input: LLMMatchInput): Promise<LLMMatchOutput>;
}
