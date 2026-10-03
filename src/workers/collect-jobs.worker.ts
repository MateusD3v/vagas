import type { FastifyBaseLogger } from 'fastify';
import type { JobSourceAdapter } from '../integrations/job-sources/job-source.interface.js';
import type { JobIngestionService } from '../modules/jobs/job-ingestion.service.js';
import type { AnalyzeJobWorker } from './analyze-job.worker.js';

export class CollectJobsWorker {
  constructor(
    private readonly ingestion: JobIngestionService,
    private readonly analyzer: AnalyzeJobWorker,
    private readonly logger: FastifyBaseLogger,
  ) {}

  async run(adapter: JobSourceAdapter) {
    this.logger.info({ worker: 'collectJobs', source: adapter.source }, 'Coletando vagas');
    const imported = await this.ingestion.import(adapter);
    const analyses = [];
    for (const jobId of imported.jobIds) {
      try {
        analyses.push(await this.analyzer.run(jobId));
      } catch (error) {
        this.logger.error({ err: error, worker: 'analyzeJob', jobId }, 'Falha ao analisar vaga');
      }
    }
    return { ...imported, analyzed: analyses.length };
  }
}
