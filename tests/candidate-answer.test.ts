import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { CandidateAnswerService } from '../src/modules/profile/candidate-answer.service.js';

describe('CandidateAnswerService', () => {
  it('faz upsert por questionKey e audita permissão de uso', async () => {
    const stored = {
      id: 'answer-1',
      candidateId: 'candidate-1',
      questionKey: 'work_authorization',
      question: 'Tem autorização para trabalhar?',
      answer: 'Sim',
      answerType: 'BOOLEAN',
      allowedForAutomaticUse: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const upsert = vi.fn().mockResolvedValue(stored);
    const audit = vi.fn().mockResolvedValue({ id: 'audit-1' });
    const db = {
      candidateProfile: {
        findFirst: vi.fn().mockResolvedValue({ id: 'candidate-1', isDemo: false }),
      },
      candidateAnswer: { upsert },
      auditLog: { create: audit },
    } as unknown as PrismaClient;
    const service = new CandidateAnswerService(db);
    const result = await service.upsert({
      questionKey: 'work_authorization',
      question: 'Tem autorização para trabalhar?',
      answer: 'Sim',
      answerType: 'BOOLEAN',
      allowedForAutomaticUse: true,
    });

    expect(result).toBe(stored);
    expect(upsert).toHaveBeenCalledOnce();
    const upsertCall = upsert.mock.calls[0]?.[0] as {
      where: { candidateId_questionKey: { candidateId: string; questionKey: string } };
      create: { candidateId: string; questionKey: string };
      update: { answer: string; allowedForAutomaticUse: boolean };
    };
    expect(upsertCall.where.candidateId_questionKey).toEqual({
      candidateId: 'candidate-1',
      questionKey: 'work_authorization',
    });
    expect(upsertCall.create.candidateId).toBe('candidate-1');
    expect(upsertCall.create.questionKey).toBe('work_authorization');
    expect(upsertCall.update.answer).toBe('Sim');
    expect(upsertCall.update.allowedForAutomaticUse).toBe(true);
    expect(audit).toHaveBeenCalledOnce();
  });
  it('não grava respostas no perfil de demonstração', async () => {
    const db = {
      candidateProfile: {
        findFirst: vi.fn().mockResolvedValue({ id: 'candidate-1', isDemo: true }),
      },
      candidateAnswer: { upsert: vi.fn() },
      auditLog: { create: vi.fn() },
    } as unknown as PrismaClient;

    await expect(
      new CandidateAnswerService(db).upsert({
        questionKey: 'remote',
        question: 'Aceita remoto?',
        answer: 'Sim',
        answerType: 'BOOLEAN',
        allowedForAutomaticUse: true,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
