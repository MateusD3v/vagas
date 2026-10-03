import type { FastifyBaseLogger } from 'fastify';
import type { MatchDecision } from '@prisma/client';
import type { ApplicationService } from '../modules/applications/application.service.js';

export class PrepareApplicationWorker {
  constructor(
    private readonly applications: ApplicationService,
    private readonly logger: FastifyBaseLogger,
  ) {}

  run(candidateId: string, jobId: string, decision: MatchDecision, score: number) {
    this.logger.info({ worker: 'prepareApplication', jobId }, 'Preparando candidatura local');
    return this.applications.prepare(candidateId, jobId, decision, score);
  }
}
