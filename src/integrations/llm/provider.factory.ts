import type { Environment } from '../../config/env.js';
import type { LLMProvider } from './provider.interface.js';
import { MockLLMProvider } from './mock.provider.js';
import { OpenAIProvider } from './openai.provider.js';

export function createLLMProvider(config: Environment): LLMProvider {
  return config.OPENAI_API_KEY
    ? new OpenAIProvider(config.OPENAI_API_KEY, config.OPENAI_MODEL)
    : new MockLLMProvider();
}
