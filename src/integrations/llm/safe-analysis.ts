import {
  llmMatchOutputSchema,
  type LLMMatchInput,
  type LLMMatchOutput,
  type LLMProvider,
} from './provider.interface.js';

export interface SafeLLMResult {
  output: LLMMatchOutput | null;
  error: Error | null;
}

export async function safeAnalyzeJobMatch(
  provider: LLMProvider,
  input: LLMMatchInput,
): Promise<SafeLLMResult> {
  try {
    return {
      output: llmMatchOutputSchema.parse(await provider.analyzeJobMatch(input)),
      error: null,
    };
  } catch (error) {
    return {
      output: null,
      error: error instanceof Error ? error : new Error('Falha desconhecida na análise de IA'),
    };
  }
}
