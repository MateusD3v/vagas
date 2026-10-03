import { env } from './config/env.js';
import { prisma } from './database/client.js';
import { createLLMProvider } from './integrations/llm/provider.factory.js';
import { JobReprocessService } from './modules/jobs/job-reprocess.service.js';
import { JobMatchingService } from './modules/matching/job-matching.service.js';

const matching = new JobMatchingService(
  prisma,
  createLLMProvider(env),
  env.AI_ADJUSTMENT_LIMIT,
  env.MATCHING_ENGINE_VERSION,
);
const service = new JobReprocessService(prisma, matching, env);

try {
  const result = await service.run();
  console.log(JSON.stringify(result));
} finally {
  await prisma.$disconnect();
}
