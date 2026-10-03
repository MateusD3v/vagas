import { Prisma, type Job, type PrismaClient } from '@prisma/client';
import type { JobSourceAdapter } from '../../integrations/job-sources/job-source.interface.js';
import { AuditService } from '../audit/audit.service.js';
import { normalizedJobSchema } from './job.schemas.js';
import type { NormalizedJobInput } from './job.schemas.js';
import { createCanonicalJobFingerprint, createJobFingerprint } from './job-fingerprint.js';

export interface ImportResult {
  discovered: number;
  imported: number;
  duplicates: number;
  jobIds: string[];
}

export interface IngestItemResult {
  job: Job;
  inserted: boolean;
  duplicated: boolean;
}

export class JobIngestionService {
  private readonly audit: AuditService;

  constructor(private readonly db: PrismaClient) {
    this.audit = new AuditService(db);
  }

  async import(adapter: JobSourceAdapter): Promise<ImportResult> {
    const rawJobs = await adapter.searchJobs();
    const result: ImportResult = {
      discovered: rawJobs.length,
      imported: 0,
      duplicates: 0,
      jobIds: [],
    };

    for (const raw of rawJobs) {
      const normalized = normalizedJobSchema.parse(adapter.normalizeJob(raw));
      const ingested = await this.ingestNormalized(normalized);
      if (ingested.duplicated) {
        result.duplicates += 1;
        continue;
      }
      result.imported += 1;
      result.jobIds.push(ingested.job.id);
    }
    return result;
  }

  async ingest(adapter: JobSourceAdapter, raw: unknown): Promise<IngestItemResult> {
    const normalized = normalizedJobSchema.parse(adapter.normalizeJob(raw));
    return this.ingestNormalized(normalized);
  }

  private async ingestNormalized(input: NormalizedJobInput): Promise<IngestItemResult> {
    const isManualSource = input.source === 'manual' || input.source.endsWith('-manual');
    const source = await this.db.jobSource.upsert({
      where: { slug: input.source },
      create: {
        slug: input.source,
        name: input.source,
        type: input.source === 'mock' ? 'MOCK' : isManualSource ? 'FEED' : 'API',
        enabled: !isManualSource,
        configuration: isManualSource ? { scheduled: false } : {},
      },
      update: {},
    });
    const fingerprint = createJobFingerprint(input);
    const canonicalFingerprint = createCanonicalJobFingerprint(input);
    const existing = await this.findExisting(input, fingerprint);
    if (existing) return this.attachReference(existing, source.id, input);

    try {
      const job = await this.db.$transaction(async (tx) => {
        const rawData = JSON.parse(JSON.stringify(input.rawData)) as Prisma.InputJsonValue;
        const created = await tx.job.create({
          data: {
            externalId: input.externalId,
            source: input.source,
            fingerprint,
            canonicalFingerprint,
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
        });
        await tx.jobSourceReference.create({
          data: {
            jobId: created.id,
            sourceId: source.id,
            externalId: input.externalId,
            originalUrl: input.originalUrl,
          },
        });
        return created;
      });
      await this.audit.record('JOB_DISCOVERED', 'Job', job.id, { source: input.source });
      return { job, inserted: true, duplicated: false };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const concurrent = await this.findExisting(input, fingerprint);
        if (concurrent) return this.attachReference(concurrent, source.id, input);
      }
      throw error;
    }
  }

  private findExisting(input: NormalizedJobInput, fingerprint: string) {
    return this.db.job.findFirst({
      where: {
        OR: [
          ...(input.externalId ? [{ source: input.source, externalId: input.externalId }] : []),
          { fingerprint },
          ...(input.externalId
            ? [
                {
                  sourceReferences: {
                    some: { source: { slug: input.source }, externalId: input.externalId },
                  },
                },
              ]
            : []),
        ],
      },
    });
  }

  private async attachReference(
    job: Job,
    sourceId: string,
    input: NormalizedJobInput,
  ): Promise<IngestItemResult> {
    const now = new Date();
    const refreshed = await this.db.$transaction(async (tx) => {
      let updatedJob: Job;
      if (job.source === input.source) {
        const rawData = JSON.parse(JSON.stringify(input.rawData)) as Prisma.InputJsonValue;
        updatedJob = await tx.job.update({
          where: { id: job.id },
          data: {
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
            lastSeenAt: now,
            isActive: true,
          },
        });
        await tx.jobSkill.deleteMany({ where: { jobId: job.id } });
        if (input.skills.length) {
          await tx.jobSkill.createMany({
            data: input.skills.map((skill) => ({ ...skill, jobId: job.id })),
          });
        }
      } else {
        updatedJob = await tx.job.update({
          where: { id: job.id },
          data: { lastSeenAt: now, isActive: true },
        });
      }

      await tx.jobSourceReference.upsert({
        where: { jobId_sourceId: { jobId: job.id, sourceId } },
        create: {
          jobId: job.id,
          sourceId,
          externalId: input.externalId,
          originalUrl: input.originalUrl,
        },
        update: {
          externalId: input.externalId,
          originalUrl: input.originalUrl,
          lastSeenAt: now,
        },
      });
      return updatedJob;
    });
    await this.audit.record('JOB_DUPLICATED', 'Job', job.id, {
      source: input.source,
      externalId: input.externalId ?? null,
      refreshedFromSameSource: job.source === input.source,
    });
    return { job: refreshed, inserted: false, duplicated: true };
  }
}
