import pino from 'pino';
import { env } from './config/env.js';
import { prisma } from './database/client.js';
import { WorkerCycleService } from './workers/worker-cycle.service.js';

const logger = pino({ level: env.LOG_LEVEL });
const cycle = new WorkerCycleService(prisma, env, logger);

cycle
  .run('cli')
  .then((result) => {
    if (!result.started) {
      logger.info({}, 'Ciclo ignorado porque outro ciclo ainda está em execução');
    }
  })
  .catch((error: unknown) => {
    logger.error({ err: error }, 'Ciclo único do worker falhou');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
