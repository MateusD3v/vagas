import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationPreparationService } from '../src/modules/applications/application-preparation.service.js';

function createApplication() {
  return {
    id: 'app-1',
    candidateId: 'candidate-1',
    jobId: 'job-1',
    status: 'READY',
    matchScore: 91,
    applicationMethod: 'MANUAL_PREPARATION',
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-01T00:00:00Z'),
    submittedAt: null,
    externalApplicationId: null,
    notes: null,
    candidate: {
      id: 'candidate-1',
      fullName: 'Mateus Teste',
      email: 'mateus@example.test',
      phone: null,
      city: 'Belém',
      state: 'PA',
      country: 'Brasil',
      linkedinUrl: null,
      githubUrl: 'https://github.com/example',
      portfolioUrl: null,
      educationLevel: 'GRADUACAO_EM_ANDAMENTO',
      course: 'Sistemas de Informação',
      institution: 'Universidade',
      graduationDate: new Date('2028-02-01T00:00:00Z'),
      professionalSummary: 'Suporte e desenvolvimento de software.',
      isDemo: false,
      yearsOfExperience: 1.5,
      desiredJobTypes: ['CLT'],
      desiredRoles: ['Backend Jr'],
      desiredLocations: ['Remoto'],
      remotePreference: 'REMOTE',
      minimumSalary: null,
      salaryCurrency: 'BRL',
      certifications: [],
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      skills: [
        {
          id: 's1',
          candidateId: 'candidate-1',
          name: 'Node.js',
          level: 'JUNIOR',
          yearsOfExperience: 1,
        },
        {
          id: 's2',
          candidateId: 'candidate-1',
          name: 'Git',
          level: 'INTERMEDIARIO',
          yearsOfExperience: 2,
        },
      ],
      languages: [{ id: 'l1', candidateId: 'candidate-1', language: 'Português', level: 'NATIVO' }],
      experiences: [
        {
          id: 'e1',
          candidateId: 'candidate-1',
          company: 'Empresa',
          role: 'Suporte TI',
          startDate: new Date('2025-06-01T00:00:00Z'),
          endDate: null,
          current: true,
          description: 'Suporte técnico.',
          technologies: ['Windows', 'Git'],
          achievements: [],
        },
        {
          id: 'e2',
          candidateId: 'candidate-1',
          company: 'Órgão',
          role: 'Desenvolvedor',
          startDate: new Date('2026-01-01T00:00:00Z'),
          endDate: null,
          current: true,
          description: 'Desenvolvimento backend.',
          technologies: ['Node.js', 'REST API'],
          achievements: [],
        },
      ],
      answers: [
        {
          id: 'a1',
          candidateId: 'candidate-1',
          questionKey: 'remote',
          question: 'Disponível para remoto?',
          answer: 'Sim',
          answerType: 'BOOLEAN',
          allowedForAutomaticUse: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'a2',
          candidateId: 'candidate-1',
          questionKey: 'salary',
          question: 'Pretensão salarial?',
          answer: 'A combinar',
          answerType: 'TEXT',
          allowedForAutomaticUse: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    },
    job: {
      id: 'job-1',
      externalId: 'external-1',
      source: 'remotive',
      fingerprint: 'fp-1',
      canonicalFingerprint: null,
      title: 'Node.js Backend Developer',
      company: 'Tech Co',
      description: 'Node.js REST API',
      location: 'Remote',
      city: null,
      state: null,
      country: 'Worldwide',
      remoteType: 'REMOTE',
      employmentType: 'FULL_TIME',
      seniority: 'JUNIOR',
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      applicationUrl: 'https://example.test/apply',
      originalUrl: 'https://example.test/job',
      publishedAt: new Date('2026-10-01T00:00:00Z'),
      collectedAt: new Date('2026-10-01T00:00:00Z'),
      lastSeenAt: new Date('2026-10-01T00:00:00Z'),
      isActive: true,
      preliminaryScore: 95,
      status: 'ANALYZED',
      rawData: {},
      requiredEducationLevel: null,
      requiredCertifications: ['AWS'],
      skills: [
        { id: 'js1', jobId: 'job-1', skill: 'Node.js', required: true, yearsRequired: null },
      ],
    },
  };
}

describe('ApplicationPreparationService', () => {
  it('gera pacote somente com evidências do perfil e respostas permitidas', async () => {
    const upsert = vi.fn().mockImplementation(({ create }) =>
      Promise.resolve({
        id: 'prep-1',
        ...create,
        version: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    const auditCreate = vi.fn().mockResolvedValue({ id: 'audit-1' });
    const db = {
      application: { findUnique: vi.fn().mockResolvedValue(createApplication()) },
      applicationPreparation: { upsert },
      auditLog: { create: auditCreate },
    } as unknown as PrismaClient;
    const service = new ApplicationPreparationService(db);
    const result = await service.prepare('app-1');

    expect(result.version).toBe(2);
    expect(upsert).toHaveBeenCalledTimes(1);
    const call = upsert.mock.calls[0]?.[0] as {
      create: {
        payload: {
          resumeMarkdown: string;
          resume: {
            skills: Array<{ name: string; matchedToJob: boolean }>;
            experiences: Array<{ role: string }>;
          };
        };
        reusableAnswers: Array<{ questionKey: string }>;
        missingInformation: string[];
      };
    };
    expect(call.create.reusableAnswers).toEqual([
      expect.objectContaining({ questionKey: 'remote' }),
    ]);
    expect(call.create.payload.resume.skills[0]).toMatchObject({
      name: 'Node.js',
      matchedToJob: true,
    });
    expect(call.create.payload.resume.experiences[0]?.role).toBe('Desenvolvedor');
    expect(call.create.payload.resumeMarkdown).toContain('# Mateus Teste');
    expect(call.create.payload.resumeMarkdown).toContain('Node.js — JUNIOR');
    expect(call.create.payload.resumeMarkdown).toContain('Desenvolvedor — Órgão');
    expect(call.create.payload.resumeMarkdown).not.toContain('AWS');
    expect(call.create.missingInformation).toEqual(
      expect.arrayContaining([
        'Telefone do candidato não informado',
        'LinkedIn do candidato não informado',
        'Certificação exigida não confirmada: AWS',
      ]),
    );
    expect(auditCreate).toHaveBeenCalledTimes(1);
  });

  it('bloqueia preparação com perfil de demonstração', async () => {
    const application = createApplication();
    application.candidate.isDemo = true;
    const db = {
      application: { findUnique: vi.fn().mockResolvedValue(application) },
      applicationPreparation: { upsert: vi.fn() },
      auditLog: { create: vi.fn() },
    } as unknown as PrismaClient;

    const service = new ApplicationPreparationService(db);
    await expect(service.prepare('app-1')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('prepara automaticamente candidaturas pendentes em lote', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 'app-1' }]);
    const upsert = vi.fn().mockResolvedValue({
      id: 'prep-1',
      applicationId: 'app-1',
      payload: {},
      reusableAnswers: [],
      missingInformation: [],
      version: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const db = {
      application: {
        findMany,
        findUnique: vi.fn().mockResolvedValue(createApplication()),
      },
      applicationPreparation: { upsert },
      auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
    } as unknown as PrismaClient;

    const result = await new ApplicationPreparationService(db).preparePending(10);

    expect(result).toMatchObject({ attempted: 1, prepared: 1, failed: 0 });
    expect(findMany).toHaveBeenCalledOnce();
    expect(upsert).toHaveBeenCalledOnce();
  });
});
