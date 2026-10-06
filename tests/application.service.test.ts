import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationService } from '../src/modules/applications/application.service.js';

describe('preparação de candidatura', () => {
  it('a mesma vaga não gera duas applications e atualiza o score', async () => {
    const existing = {
      id: 'application-1',
      candidateId: 'candidate-1',
      jobId: 'job-1',
      status: 'READY',
      matchScore: 80,
    };
    const create = vi.fn();
    const update = vi.fn().mockResolvedValue({ ...existing, matchScore: 90 });
    const db = {
      $queryRaw: vi.fn(),
      application: {
        findUnique: vi.fn().mockResolvedValue(existing),
        create,
        update,
      },
      auditLog: { create: vi.fn() },
    } as unknown as PrismaClient;
    const result = await new ApplicationService(db).prepare('candidate-1', 'job-1', 'APPLY', 90);
    expect(result?.matchScore).toBe(90);
    expect(create).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
  });

  it('remove preparação não enviada quando a reanálise vira SKIP', async () => {
    const existing = { id: 'application-1', status: 'READY' };
    const remove = vi.fn().mockResolvedValue(existing);
    const db = {
      $queryRaw: vi.fn(),
      application: {
        findUnique: vi.fn().mockResolvedValue(existing),
        delete: remove,
      },
      auditLog: { create: vi.fn() },
    } as unknown as PrismaClient;

    await expect(
      new ApplicationService(db).prepare('candidate-1', 'job-1', 'SKIP', 40),
    ).resolves.toBeNull();
    expect(remove).toHaveBeenCalledOnce();
  });

  it('preserva candidaturas aceitas mesmo se a reanálise virar SKIP', async () => {
    const existing = { id: 'application-accepted', status: 'ACCEPTED' };
    const remove = vi.fn();
    const db = {
      $queryRaw: vi.fn(),
      application: {
        findUnique: vi.fn().mockResolvedValue(existing),
        delete: remove,
      },
      auditLog: { create: vi.fn() },
    } as unknown as PrismaClient;

    const result = await new ApplicationService(db).prepare('candidate-1', 'job-1', 'SKIP', 20);
    expect(result).toBe(existing);
    expect(remove).not.toHaveBeenCalled();
  });

  it('preserva candidaturas já submetidas mesmo se a reanálise virar SKIP', async () => {
    const existing = { id: 'application-1', status: 'SUBMITTED' };
    const remove = vi.fn();
    const db = {
      $queryRaw: vi.fn(),
      application: {
        findUnique: vi.fn().mockResolvedValue(existing),
        delete: remove,
      },
      auditLog: { create: vi.fn() },
    } as unknown as PrismaClient;

    const result = await new ApplicationService(db).prepare('candidate-1', 'job-1', 'SKIP', 40);
    expect(result).toBe(existing);
    expect(remove).not.toHaveBeenCalled();
  });
});

describe('acompanhamento de candidatura', () => {
  it('registra submissão manual e data de envio', async () => {
    const existing = {
      id: 'application-1',
      candidateId: 'candidate-1',
      jobId: 'job-1',
      status: 'READY',
      matchScore: 90,
    };
    const update = vi
      .fn()
      .mockImplementation(({ data }) => Promise.resolve({ ...existing, ...data }));
    const audit = vi.fn().mockResolvedValue({ id: 'audit-1' });
    const eventCreate = vi.fn().mockResolvedValue({ id: 'event-1' });
    const db = {
      $queryRaw: vi.fn(),
      application: {
        findUnique: vi.fn().mockResolvedValue(existing),
        update,
      },
      applicationEvent: { create: eventCreate },
      auditLog: { create: audit },
    };
    const transaction = vi.fn((callback: (client: typeof db) => Promise<unknown>) => callback(db));
    const prisma = { ...db, $transaction: transaction } as unknown as PrismaClient;

    const result = await new ApplicationService(prisma).updateStatus('application-1', {
      status: 'SUBMITTED',
      externalApplicationId: 'ats-123',
    });

    expect(result.status).toBe('SUBMITTED');
    expect(update).toHaveBeenCalledOnce();
    const updateCall = update.mock.calls[0]?.[0] as {
      where: { id: string };
      data: {
        status: string;
        submittedAt?: Date;
        nextFollowUpAt?: Date;
        externalApplicationId?: string;
        followUpNotifiedAt?: Date | null;
      };
    };
    expect(updateCall.where.id).toBe('application-1');
    expect(updateCall.data.status).toBe('SUBMITTED');
    expect(updateCall.data.submittedAt).toBeInstanceOf(Date);
    expect(updateCall.data.nextFollowUpAt).toBeInstanceOf(Date);
    expect(updateCall.data.nextFollowUpAt!.getTime() - updateCall.data.submittedAt!.getTime()).toBe(
      7 * 24 * 60 * 60 * 1000,
    );
    expect(updateCall.data.externalApplicationId).toBe('ats-123');
    expect(updateCall.data.followUpNotifiedAt).toBeNull();
    const eventCall = eventCreate.mock.calls[0]?.[0] as {
      data: {
        applicationId: string;
        fromStatus: string;
        toStatus: string;
        source: string;
        externalApplicationId: string | null;
      };
    };
    expect(eventCall.data).toMatchObject({
      applicationId: 'application-1',
      fromStatus: 'READY',
      toStatus: 'SUBMITTED',
      source: 'MANUAL',
      externalApplicationId: 'ats-123',
    });
    expect(audit).toHaveBeenCalledOnce();
  });
  it('permite aceitar uma oferta e encerra follow-up pendente', async () => {
    const existing = {
      id: 'application-1',
      candidateId: 'candidate-1',
      jobId: 'job-1',
      status: 'OFFER',
      matchScore: 90,
    };
    const update = vi
      .fn()
      .mockImplementation(({ data }) => Promise.resolve({ ...existing, ...data }));
    const eventCreate = vi.fn().mockResolvedValue({ id: 'event-1' });
    const db = {
      $queryRaw: vi.fn(),
      application: { findUnique: vi.fn().mockResolvedValue(existing), update },
      applicationEvent: { create: eventCreate },
      auditLog: { create: vi.fn() },
    };
    const transaction = vi.fn((callback: (client: typeof db) => Promise<unknown>) => callback(db));
    const prisma = { ...db, $transaction: transaction } as unknown as PrismaClient;

    const result = await new ApplicationService(prisma).updateStatus('application-1', {
      status: 'ACCEPTED',
    });

    expect(result.status).toBe('ACCEPTED');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'ACCEPTED',
          nextFollowUpAt: null,
          followUpNotifiedAt: null,
        }) as object,
      }),
    );
  });

  it('bloqueia salto inválido de READY direto para OFFER', async () => {
    const db = {
      $queryRaw: vi.fn(),
      application: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'application-1',
          candidateId: 'candidate-1',
          jobId: 'job-1',
          status: 'READY',
          matchScore: 90,
        }),
        update: vi.fn(),
      },
      auditLog: { create: vi.fn() },
    } as unknown as PrismaClient;

    await expect(
      new ApplicationService(db).updateStatus('application-1', { status: 'OFFER' }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

it('preserva tentativa desconhecida ao reanalisar a vaga como SKIP', async () => {
  const existing = {
    id: 'application-1',
    status: 'READY',
    submissionAttempt: { status: 'UNKNOWN' },
  };
  const db = {
    application: {
      findUnique: vi.fn().mockResolvedValue(existing),
      delete: vi.fn(),
      update: vi.fn(),
    },
  };
  expect(
    await new ApplicationService(db as unknown as PrismaClient).prepare(
      'candidate-1',
      'job-1',
      'SKIP',
      20,
    ),
  ).toBe(existing);
  expect(db.application.delete).not.toHaveBeenCalled();
  expect(db.application.update).not.toHaveBeenCalled();
});
