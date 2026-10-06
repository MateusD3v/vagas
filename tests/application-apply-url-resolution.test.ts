import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationApplyUrlResolutionService } from '../src/modules/applications/application-apply-url-resolution.service.js';
import type { AppLogger } from '../src/shared/logger.js';

const logger: AppLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

type JobUpdateArgs = {
  where: { id: string };
  data: {
    applicationUrl?: string;
    originalUrl?: string;
    rawData: unknown;
  };
};

function jobUpdateMock() {
  return vi.fn<(args: JobUpdateArgs) => Promise<object>>().mockResolvedValue({});
}

function fixture(
  source: 'remoteok' | 'remotive' | 'arbeitnow',
  applicationUrl: string,
  rawData: Record<string, unknown> = {},
) {
  return {
    id: 'application-1',
    status: 'READY',
    matchScore: 92,
    updatedAt: new Date('2026-10-06T12:00:00Z'),
    job: {
      id: 'job-1',
      source,
      applicationUrl,
      originalUrl: applicationUrl,
      rawData,
    },
  };
}

describe('ApplicationApplyUrlResolutionService', () => {
  it('promove applyUrl já armazenado pela Remote OK', async () => {
    const update = jobUpdateMock();
    const audit = vi.fn().mockResolvedValue({});
    const db = {
      application: {
        findMany: vi.fn().mockResolvedValue([
          fixture('remoteok', 'https://remoteok.com/remote-jobs/example', {
            applyUrl: 'https://boards.greenhouse.io/acme/jobs/123',
          }),
        ]),
      },
      job: { update },
      auditLog: { create: audit },
    } as unknown as PrismaClient;
    const getText = vi.fn();
    const getFinalUrl = vi.fn();

    const result = await new ApplicationApplyUrlResolutionService(
      db,
      { getText, getFinalUrl },
      logger,
    ).resolvePending(5);

    expect(result).toMatchObject({ attempted: 1, resolved: 1, failed: 0 });
    expect(getText).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
    expect(update.mock.calls[0]?.[0]).toMatchObject({
      where: { id: 'job-1' },
      data: {
        applicationUrl: 'https://boards.greenhouse.io/acme/jobs/123',
        originalUrl: 'https://remoteok.com/remote-jobs/example',
      },
    });
    expect(audit).toHaveBeenCalledOnce();
  });

  it('extrai link externo público da página Remotive', async () => {
    const update = jobUpdateMock();
    const db = {
      application: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            fixture(
              'remotive',
              'https://remotive.com/remote-jobs/information-technology/example-1',
            ),
          ]),
      },
      job: { update },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    } as unknown as PrismaClient;
    const getText = vi
      .fn()
      .mockResolvedValue(
        '<html><a href="https://unio-digital.breezy.hr/p/abc-role">Apply for this position</a></html>',
      );

    const result = await new ApplicationApplyUrlResolutionService(
      db,
      { getText, getFinalUrl },
      logger,
    ).resolvePending(5);

    expect(result).toMatchObject({ attempted: 1, resolved: 1, failed: 0 });
    expect(getText).toHaveBeenCalledOnce();
    expect(update.mock.calls[0]?.[0]).toMatchObject({
      data: {
        applicationUrl: 'https://unio-digital.breezy.hr/p/abc-role',
        originalUrl: 'https://remotive.com/remote-jobs/information-technology/example-1',
      },
    });
  });

  it('não aceita link interno da Remotive como destino externo', async () => {
    const update = jobUpdateMock();
    const db = {
      application: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            fixture(
              'remotive',
              'https://remotive.com/remote-jobs/information-technology/example-1',
            ),
          ]),
      },
      job: { update },
      auditLog: { create: vi.fn() },
    } as unknown as PrismaClient;
    const getText = vi
      .fn()
      .mockResolvedValue('<a href="/remote-jobs/example">Apply for this position</a>');

    const result = await new ApplicationApplyUrlResolutionService(
      db,
      { getText, getFinalUrl },
      logger,
    ).resolvePending(5);

    expect(result).toMatchObject({ attempted: 1, resolved: 0, unchanged: 1, failed: 0 });
    const stored = update.mock.calls[0]?.[0].data.rawData;
    expect(stored).toMatchObject({
      applyUrlResolution: {
        status: 'NO_EXTERNAL_LINK',
        sourceUrl: 'https://remotive.com/remote-jobs/information-technology/example-1',
        resolvedUrl: null,
      },
    });
  });

  it('resolve o endpoint /apply público do Arbeitnow para Greenhouse', async () => {
    const update = jobUpdateMock();
    const audit = vi.fn().mockResolvedValue({});
    const sourceUrl =
      'https://www.arbeitnow.fr/jobs/companies/shifttechnology/junior-backend-developer-c-net-paris-113660';
    const db = {
      application: {
        findMany: vi.fn().mockResolvedValue([fixture('arbeitnow', sourceUrl)]),
      },
      job: { update },
      auditLog: { create: audit },
    } as unknown as PrismaClient;
    const getText = vi.fn();
    const getFinalUrl = vi
      .fn()
      .mockResolvedValue(
        'https://job-boards.greenhouse.io/shifttechnology/jobs/8010298003?utm_source=arbeitnow.fr',
      );

    const result = await new ApplicationApplyUrlResolutionService(
      db,
      { getText, getFinalUrl },
      logger,
    ).resolvePending(5);

    expect(result).toMatchObject({ attempted: 1, resolved: 1, failed: 0 });
    expect(getText).not.toHaveBeenCalled();
    expect(getFinalUrl).toHaveBeenCalledWith(sourceUrl + '/apply', {
      source: 'arbeitnow-apply-url-resolver',
      requestsPerSecond: 1,
    });
    expect(update.mock.calls[0]?.[0]).toMatchObject({
      data: {
        applicationUrl:
          'https://job-boards.greenhouse.io/shifttechnology/jobs/8010298003?utm_source=arbeitnow.fr',
        originalUrl: sourceUrl,
      },
    });
    expect(audit).toHaveBeenCalledOnce();
  });

  it('resolve o endpoint /apply público do Arbeitnow para Ashby', async () => {
    const update = jobUpdateMock();
    const sourceUrl =
      'https://www.arbeitnow.fr/jobs/companies/escape/junior-full-stack-engineer-ai-security-paris-149930';
    const db = {
      application: {
        findMany: vi.fn().mockResolvedValue([fixture('arbeitnow', sourceUrl)]),
      },
      job: { update },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    } as unknown as PrismaClient;
    const getText = vi.fn();
    const getFinalUrl = vi
      .fn()
      .mockResolvedValue(
        'https://jobs.ashbyhq.com/escape/8a939b02-1fd2-4c57-9564-4f691d9fbbce/application',
      );

    const result = await new ApplicationApplyUrlResolutionService(
      db,
      { getText, getFinalUrl },
      logger,
    ).resolvePending(5);

    expect(result).toMatchObject({ attempted: 1, resolved: 1, failed: 0 });
    expect(update.mock.calls[0]?.[0]).toMatchObject({
      data: {
        applicationUrl:
          'https://jobs.ashbyhq.com/escape/8a939b02-1fd2-4c57-9564-4f691d9fbbce/application',
        originalUrl: sourceUrl,
      },
    });
  });

  it('mantém JOIN como link externo resolvido mesmo sem enriquecimento ATS', async () => {
    const update = jobUpdateMock();
    const sourceUrl =
      'https://www.arbeitnow.com/jobs/companies/fastrocket-gmbh/full-stack-softwareentwickler-react-nextjs-oder-angular-nestjs-nodejs-100-remote-regen-7823';
    const db = {
      application: {
        findMany: vi.fn().mockResolvedValue([fixture('arbeitnow', sourceUrl)]),
      },
      job: { update },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    } as unknown as PrismaClient;
    const getText = vi.fn();
    const getFinalUrl = vi
      .fn()
      .mockResolvedValue(
        'https://join.com/companies/fastrocket/16794138-full-stack-softwareentwickler',
      );

    const result = await new ApplicationApplyUrlResolutionService(
      db,
      { getText, getFinalUrl },
      logger,
    ).resolvePending(5);

    expect(result).toMatchObject({ attempted: 1, resolved: 1, failed: 0 });
    expect(update.mock.calls[0]?.[0]).toMatchObject({
      data: {
        applicationUrl:
          'https://join.com/companies/fastrocket/16794138-full-stack-softwareentwickler',
        originalUrl: sourceUrl,
      },
    });
  });

  it('usa cache recente após tentativa sem resolução', async () => {
    const update = jobUpdateMock();
    const getText = vi.fn();
    const getFinalUrl = vi.fn();
    const sourceUrl = 'https://remotive.com/remote-jobs/information-technology/example-1';
    const db = {
      application: {
        findMany: vi.fn().mockResolvedValue([
          fixture('remotive', sourceUrl, {
            applyUrlResolution: {
              sourceUrl,
              status: 'NO_EXTERNAL_LINK',
              checkedAt: new Date().toISOString(),
            },
          }),
        ]),
      },
      job: { update },
      auditLog: { create: vi.fn() },
    } as unknown as PrismaClient;

    const result = await new ApplicationApplyUrlResolutionService(
      db,
      { getText, getFinalUrl },
      logger,
    ).resolvePending(5);

    expect(result).toMatchObject({ attempted: 0, resolved: 0, skipped: 1, failed: 0 });
    expect(getText).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
