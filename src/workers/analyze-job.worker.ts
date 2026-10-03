import type { FastifyBaseLogger } from 'fastify';
import type { JobMatchingService } from '../modules/matching/job-matching.service.js';

export class AnalyzeJobWorker {
  constructor(
    private readonly matching: JobMatchingService,
    private readonly logger: FastifyBaseLogger,
  ) {}

  async run(jobId: string) {
    this.logger.info({ worker: 'analyzeJob', jobId }, 'Analisando vaga');
    return this.matching.analyze(jobId);
  }
}
