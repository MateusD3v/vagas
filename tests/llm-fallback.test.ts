import { describe, expect, it } from 'vitest';
import type { LLMProvider } from '../src/integrations/llm/provider.interface.js';
import { safeAnalyzeJobMatch } from '../src/integrations/llm/safe-analysis.js';

describe('fallback da IA', () => {
  it('resposta inválida não quebra a análise', async () => {
    const invalidProvider = {
      analyzeJobMatch: async () => Promise.resolve({ scoreAdjustment: 'muito' }),
    } as unknown as LLMProvider;
    const result = await safeAnalyzeJobMatch(invalidProvider, {
      candidate: {
        professionalSummary: 'Resumo',
        yearsOfExperience: 1,
        skills: [],
        desiredRoles: [],
      },
      job: { title: 'Vaga', description: 'Descrição', skills: [] },
      deterministicScore: 70,
    });
    expect(result.output).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
  });
});
