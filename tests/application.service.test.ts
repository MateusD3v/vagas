import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationService } from '../src/modules/applications/application.service.js';

describe('preparação de candidatura', () => {
  it('a mesma vaga não gera duas applications', async () => {
    const existing = { id: 'application-1', candidateId: 'candidate-1', jobId: 'job-1' };
    const create = vi.fn();
    const db = {
      application: {
        findUnique: vi.fn().mockResolvedValue(existing),
        create,
      },
      auditLog: { create: vi.fn() },
    } as unknown as PrismaClient;
    const result = await new ApplicationService(db).prepare('candidate-1', 'job-1', 'APPLY', 90);
    expect(result).toBe(existing);
    expect(create).not.toHaveBeenCalled();
  });
});
