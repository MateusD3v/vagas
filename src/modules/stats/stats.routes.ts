import type { FastifyInstance } from 'fastify';
import { prisma } from '../../database/client.js';

export function statsRoutes(app: FastifyInstance): void {
  app.get(
    '/stats',
    { schema: { tags: ['Stats'], summary: 'Retorna os indicadores da operação' } },
    async () => {
      const [
        jobsDiscovered,
        jobsAnalyzed,
        apply,
        review,
        skipped,
        applicationsReady,
        applicationsSubmitted,
        interviews,
        sourceRecords,
        sourceAggregates,
      ] = await Promise.all([
        prisma.job.count(),
        prisma.job.count({ where: { status: 'ANALYZED' } }),
        prisma.jobMatch.count({ where: { decision: 'APPLY' } }),
        prisma.jobMatch.count({ where: { decision: 'REVIEW' } }),
        prisma.jobMatch.count({ where: { decision: 'SKIP' } }),
        prisma.application.count({ where: { status: 'READY' } }),
        prisma.application.count({ where: { status: 'SUBMITTED' } }),
        prisma.application.count({ where: { status: 'INTERVIEW' } }),
        prisma.jobSource.findMany({ select: { id: true, name: true, slug: true } }),
        prisma.collectionRun.groupBy({
          by: ['sourceId'],
          _count: { _all: true },
          _sum: {
            jobsFetched: true,
            jobsInserted: true,
            jobsDuplicated: true,
            errorCount: true,
          },
        }),
      ]);
      const aggregates = new Map(sourceAggregates.map((item) => [item.sourceId, item]));
      const sources = sourceRecords.map((source) => {
        const aggregate = aggregates.get(source.id);
        return {
          name: source.name,
          slug: source.slug,
          runs: aggregate?._count._all ?? 0,
          jobsFetched: aggregate?._sum.jobsFetched ?? 0,
          jobsInserted: aggregate?._sum.jobsInserted ?? 0,
          duplicates: aggregate?._sum.jobsDuplicated ?? 0,
          errors: aggregate?._sum.errorCount ?? 0,
        };
      });
      return {
        jobsDiscovered,
        jobsAnalyzed,
        apply,
        review,
        skipped,
        applicationsReady,
        applicationsSubmitted,
        interviews,
        sources,
      };
    },
  );
}
