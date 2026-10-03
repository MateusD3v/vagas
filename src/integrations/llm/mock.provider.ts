import type { LLMMatchInput, LLMMatchOutput, LLMProvider } from './provider.interface.js';

export class MockLLMProvider implements LLMProvider {
  async analyzeJobMatch(input: LLMMatchInput): Promise<LLMMatchOutput> {
    return Promise.resolve({
      scoreAdjustment: 0,
      matchedSkills: [],
      missingSkills: [],
      strengths: [],
      weaknesses: [],
      summary: `Análise local baseada exclusivamente nas regras determinísticas (score ${input.deterministicScore}).`,
    });
  }
}
