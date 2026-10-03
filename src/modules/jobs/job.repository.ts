import type { Prisma, PrismaClient } from '@prisma/client';
import type { NormalizedJobInput } from './job.schemas.js';
import { createCanonicalJobFingerprint, createJobFingerprint } from './job-fingerprint.js';

export class JobRepository {
  constructor(private readonly db: PrismaClient) {}

  async findDuplicate(input: NormalizedJobInput) {
    if (input.externalId) {
      const externalMatch = await this.db.job.findUnique({
        where: { source_externalId: { source: input.source, externalId: input.externalId } },
      });
      if (externalMatch) return externalMatch;
    }
    const fingerprint = createJobFingerprint(input);
    return this.db.job.findUnique({ where: { fingerprint } });
  }

  create(input: NormalizedJobInput) {
    const rawData = JSON.parse(JSON.stringify(input.rawData)) as Prisma.InputJsonValue;
    return this.db.job.create({
      data: {
        externalId: input.externalId,
        source: input.source,
        fingerprint: createJobFingerprint(input),
        canonicalFingerprint: createCanonicalJobFingerprint(input),
        title: input.title,
        company: input.company,
        description: input.description,
        location: input.location,
        city: input.city,
        state: input.state,
        country: input.country,
        remoteType: input.remoteType,
        employmentType: input.employmentType,
        seniority: input.seniority,
        salaryMin: input.salaryMin,
        salaryMax: input.salaryMax,
        salaryCurrency: input.salaryCurrency,
        applicationUrl: input.applicationUrl,
        originalUrl: input.originalUrl,
        publishedAt: input.publishedAt,
        rawData,
        requiredEducationLevel: input.requiredEducationLevel,
        requiredCertifications: input.requiredCertifications,
        skills: { create: input.skills },
      },
      include: { skills: true },
    });
  }

  findById(id: string) {
    return this.db.job.findUnique({
      where: { id },
      include: {
        skills: true,
        matches: true,
        applications: true,
        sourceReferences: { include: { source: true } },
      },
    });
  }
}
