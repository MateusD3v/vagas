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

  it('preserva candidaturas já submetidas mesmo se a reanálise virar SKIP', async () => {
    const existing = { id: 'application-1', status: 'SUBMITTED' };
    const remove = vi.fn();
    const db = {
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
