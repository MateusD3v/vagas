import type { Prisma, PrismaClient } from '@prisma/client';
import { AppError, paginationMeta } from '../../shared/http.js';
import type { z } from 'zod';
import type { jobsQuerySchema } from './job.schemas.js';
import { JobRepository } from './job.repository.js';

type JobsQuery = z.infer<typeof jobsQuerySchema>;

export class JobService {
  private readonly repository: JobRepository;

  constructor(private readonly db: PrismaClient) {
    this.repository = new JobRepository(db);
  }

  async list(query: JobsQuery) {
    const where: Prisma.JobWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.source ? { source: query.source } : {}),
      ...(query.company ? { company: { contains: query.company, mode: 'insensitive' } } : {}),
      ...(query.remoteType ? { remoteType: query.remoteType } : {}),
      ...(query.minimumScore !== undefined || query.decision
        ? {
            matches: {
              some: {
                ...(query.minimumScore !== undefined ? { score: { gte: query.minimumScore } } : {}),
                ...(query.decision ? { decision: query.decision } : {}),
              },
            },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.db.job.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { collectedAt: 'desc' },
        include: {
          skills: true,
          matches: true,
          applications: true,
          sourceReferences: { include: { source: true } },
        },
      }),
      this.db.job.count({ where }),
    ]);
    return { data: items, meta: paginationMeta(total, query.page, query.pageSize) };
  }

  async get(id: string) {
    const job = await this.repository.findById(id);
    if (!job) throw new AppError('Vaga não encontrada', 404);
    return job;
  }
}
