import {
  llmMatchOutputSchema,
  type LLMMatchInput,
  type LLMMatchOutput,
  type LLMProvider,
} from './provider.interface.js';

interface OpenAIResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

export class OpenAIProvider implements LLMProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async analyzeJobMatch(input: LLMMatchInput): Promise<LLMMatchOutput> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Você audita compatibilidade de vagas. Responda somente JSON com scoreAdjustment, matchedSkills, missingSkills, strengths, weaknesses e summary. Nunca atribua ao candidato uma competência que não esteja na lista fornecida.',
          },
          { role: 'user', content: JSON.stringify(input) },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await response.json()) as OpenAIResponse;
    if (!response.ok)
      throw new Error(body.error?.message ?? `LLM respondeu HTTP ${response.status}`);
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error('LLM retornou conteúdo vazio');
    return llmMatchOutputSchema.parse(JSON.parse(content) as unknown);
  }
}
