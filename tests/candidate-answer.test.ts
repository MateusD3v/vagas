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
  it('bloqueia reutilização automática de pergunta sensível', async () => {
    const db = {
      candidateProfile: { findFirst: vi.fn() },
      candidateAnswer: { upsert: vi.fn() },
      auditLog: { create: vi.fn() },
    } as unknown as PrismaClient;

    await expect(
      new CandidateAnswerService(db).upsert({
        questionKey: 'gender',
        question: 'Gender',
        answer: 'Prefiro não informar',
        answerType: 'SELECT',
        allowedForAutomaticUse: true,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('salva resposta somente para pergunta conhecida da candidatura e gera chave estável', async () => {
    const stored = {
      id: 'answer-ats',
      candidateId: 'candidate-1',
      questionKey: 'ats_why_do_you_want_to_work_here',
      question: 'Why do you want to work here?',
      answer: 'Quero contribuir com minha experiência em tecnologia.',
      answerType: 'textarea',
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
      application: {
        findFirst: vi.fn().mockResolvedValue({
          job: {
            rawData: {
              applicationQuestions: [
                {
                  label: 'Why do you want to work here?',
                  required: true,
                  fields: [{ name: 'question_1', type: 'textarea' }],
                },
              ],
            },
          },
        }),
      },
      candidateAnswer: { upsert },
      auditLog: { create: audit },
    } as unknown as PrismaClient;

    const result = await new CandidateAnswerService(db).upsertForApplication('app-1', {
      question: 'Why do you want to work here?',
      answer: 'Quero contribuir com minha experiência em tecnologia.',
      allowedForAutomaticUse: true,
    });

    expect(result).toBe(stored);
    expect(upsert).toHaveBeenCalledOnce();
    const call = upsert.mock.calls[0]?.[0] as {
      create: { questionKey: string; answerType: string };
      update: { allowedForAutomaticUse: boolean };
    };
    expect(call.create.questionKey).toBe('ats_why_do_you_want_to_work_here');
    expect(call.create.answerType).toBe('textarea');
    expect(call.update.allowedForAutomaticUse).toBe(true);
    expect(audit).toHaveBeenCalledOnce();
  });

  it('recusa pergunta que não pertence ao formulário conhecido da candidatura', async () => {
    const db = {
      candidateProfile: {
        findFirst: vi.fn().mockResolvedValue({ id: 'candidate-1', isDemo: false }),
      },
      application: {
        findFirst: vi.fn().mockResolvedValue({
          job: {
            rawData: {
              applicationQuestions: [
                {
                  label: 'Pergunta conhecida',
                  required: true,
                  fields: [],
                },
              ],
            },
          },
        }),
      },
      candidateAnswer: { upsert: vi.fn() },
      auditLog: { create: vi.fn() },
    } as unknown as PrismaClient;

    await expect(
      new CandidateAnswerService(db).upsertForApplication('app-1', {
        question: 'Pergunta inventada',
        answer: 'Resposta',
        allowedForAutomaticUse: true,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('valida opções conhecidas e salva o rótulo canônico', async () => {
    const upsert = vi
      .fn()
      .mockImplementation(({ create }) => Promise.resolve({ id: 'answer-option', ...create }));
    const db = {
      candidateProfile: {
        findFirst: vi.fn().mockResolvedValue({ id: 'candidate-1', isDemo: false }),
      },
      application: {
        findFirst: vi.fn().mockResolvedValue({
          job: {
            rawData: {
              applicationQuestions: [
                {
                  label: 'Aceita trabalho remoto?',
                  required: true,
                  fields: [
                    {
                      name: 'question_remote',
                      type: 'multi_value_single_select',
                      values: [
                        { label: 'Não', value: 0 },
                        { label: 'Sim', value: 1 },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        }),
      },
      candidateAnswer: { upsert },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
    } as unknown as PrismaClient;

    const result = await new CandidateAnswerService(db).upsertForApplication('app-1', {
      question: 'Aceita trabalho remoto?',
      answer: '1',
      allowedForAutomaticUse: true,
    });

    expect(result.answer).toBe('Sim');
  });

  it('recusa resposta fora das opções conhecidas do ATS', async () => {
    const db = {
      candidateProfile: {
        findFirst: vi.fn().mockResolvedValue({ id: 'candidate-1', isDemo: false }),
      },
      application: {
        findFirst: vi.fn().mockResolvedValue({
          job: {
            rawData: {
              applicationQuestions: [
                {
                  label: 'Disponibilidade',
                  required: true,
                  fields: [
                    {
                      type: 'multi_value_single_select',
                      values: [{ label: 'Imediata', value: 'immediate' }],
                    },
                  ],
                },
              ],
            },
          },
        }),
      },
      candidateAnswer: { upsert: vi.fn() },
      auditLog: { create: vi.fn() },
    } as unknown as PrismaClient;

    await expect(
      new CandidateAnswerService(db).upsertForApplication('app-1', {
        question: 'Disponibilidade',
        answer: 'Daqui a dois meses',
        allowedForAutomaticUse: true,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
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
