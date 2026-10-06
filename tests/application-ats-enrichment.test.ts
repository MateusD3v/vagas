import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationAtsEnrichmentService } from '../src/modules/applications/application-ats-enrichment.service.js';
import type { AppLogger } from '../src/shared/logger.js';

const logger: AppLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function applicationFixture(
  applicationUrl = 'https://boards.greenhouse.io/acme/jobs/123',
  rawData: Record<string, unknown> = {},
) {
  return {
    id: 'application-1',
    status: 'READY',
    matchScore: 92,
    updatedAt: new Date('2026-10-06T10:00:00Z'),
    job: {
      id: 'job-1',
      source: 'himalayas',
      applicationUrl,
      rawData,
    },
  };
}

describe('ApplicationAtsEnrichmentService', () => {
  it('enriquece candidatura ATS e persiste perguntas públicas', async () => {
    const update = vi.fn().mockResolvedValue({});
    const audit = vi.fn().mockResolvedValue({});
    const db = {
      application: {
        findMany: vi.fn().mockResolvedValue([applicationFixture()]),
      },
      job: { update },
      auditLog: { create: audit },
    } as unknown as PrismaClient;
    const resolve = vi.fn().mockResolvedValue({
      supported: true,
      platform: 'GREENHOUSE',
      flow: 'ATS',
      data: {
        applicationUrl: 'https://boards.greenhouse.io/acme/jobs/123',
      },
      missingFields: [],
      applicationQuestions: [
        {
          label: 'Possui disponibilidade?',
          required: true,
          fields: [{ name: 'availability', type: 'input_text' }],
        },
      ],
    });

    const result = await new ApplicationAtsEnrichmentService(
      db,
      { resolve },
      logger,
    ).enrichPending(5);

    expect(result).toMatchObject({
      attempted: 1,
      enriched: 1,
      supported: 1,
      questionsFound: 1,
      failed: 0,
    });
    expect(resolve).toHaveBeenCalledWith('https://boards.greenhouse.io/acme/jobs/123');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: {
        rawData: expect.objectContaining({
          atsEnrichment: expect.objectContaining({
            status: 'SUPPORTED',
            supported: true,
            platform: 'GREENHOUSE',
          }),
          applicationQuestions: [
            {
              label: 'Possui disponibilidade?',
              required: true,
              fields: [{ name: 'availability', type: 'input_text' }],
            },
          ],
        }),
      },
    });
    expect(audit).toHaveBeenCalledOnce();
  });

  it('respeita cache recente para a mesma URL ATS', async () => {
    const resolve = vi.fn();
    const db = {
      application: {
        findMany: vi.fn().mockResolvedValue([
          applicationFixture('https://boards.greenhouse.io/acme/jobs/123', {
            atsEnrichment: {
              status: 'SUPPORTED',
              supported: true,
              platform: 'GREENHOUSE',
              applicationUrl: 'https://boards.greenhouse.io/acme/jobs/123',
              checkedAt: new Date().toISOString(),
            },
          }),
        ]),
      },
      job: { update: vi.fn() },
      auditLog: { create: vi.fn() },
    } as unknown as PrismaClient;

    const result = await new ApplicationAtsEnrichmentService(
      db,
      { resolve },
      logger,
    ).enrichPending(5);

    expect(result.attempted).toBe(0);
    expect(result.skipped).toBe(1);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('ignora URLs que não são reconhecidas como ATS', async () => {
    const resolve = vi.fn();
    const db = {
      application: {
        findMany: vi.fn().mockResolvedValue([
          applicationFixture('https://example.com/jobs/123'),
        ]),
      },
      job: { update: vi.fn() },
      auditLog: { create: vi.fn() },
    } as unknown as PrismaClient;

    const result = await new ApplicationAtsEnrichmentService(
      db,
      { resolve },
      logger,
    ).enrichPending(5);

    expect(result.attempted).toBe(0);
    expect(result.skipped).toBe(1);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('registra falha transitória sem abortar o lote', async () => {
    const update = vi.fn().mockResolvedValue({});
    const resolve = vi.fn().mockRejectedValue(new Error('timeout'));
    const warn = vi.fn();
    const db = {
      application: {
        findMany: vi.fn().mockResolvedValue([applicationFixture()]),
      },
      job: { update },
      auditLog: { create: vi.fn() },
    } as unknown as PrismaClient;

    const result = await new ApplicationAtsEnrichmentService(
      db,
      { resolve },
      { ...logger, warn },
    ).enrichPending(5);

    expect(result).toMatchObject({
      attempted: 1,
      enriched: 0,
      supported: 0,
      questionsFound: 0,
      failed: 1,
    });
    expect(result.failures).toEqual([
      { applicationId: 'application-1', message: 'timeout' },
    ]);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: {
        rawData: expect.objectContaining({
          atsEnrichment: expect.objectContaining({
            status: 'FAILED',
            applicationUrl: 'https://boards.greenhouse.io/acme/jobs/123',
            message: 'timeout',
          }),
        }),
      },
    });
    expect(warn).toHaveBeenCalledOnce();
  });
});
