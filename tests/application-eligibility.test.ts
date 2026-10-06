import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationEligibilityService } from '../src/modules/applications/application-eligibility.service.js';

function eligibleApplication() {
  return {
    id: 'app-1',
    candidateId: 'candidate-1',
    jobId: 'job-1',
    status: 'READY',
    matchScore: 92,
    applicationMethod: 'MANUAL_PREPARATION',
    createdAt: new Date(),
    updatedAt: new Date(),
    submittedAt: null,
    externalApplicationId: null,
    notes: null,
    candidate: {
      id: 'candidate-1',
      policy: {
        id: 'policy-1',
        candidateId: 'candidate-1',
        autoApplyEnabled: true,
        minimumScore: 85,
        maximumApplicationsPerDay: 5,
        allowedSources: ['remotive'],
        blockedCompanies: [] as string[],
        blockedKeywords: [] as string[],
        requireSalaryInformation: false,
        requireRemote: true,
      },
    },
    job: {
      id: 'job-1',
      isActive: true,
      status: 'ANALYZED',
      matches: [{ candidateId: 'candidate-1', decision: 'APPLY', hardConstraints: [] as string[] }],
      source: 'remotive',
      title: 'Backend Junior',
      company: 'Tech Co',
      description: 'Node.js',
      remoteType: 'REMOTE',
      salaryMin: null,
      salaryMax: null,
    },
    preparation: {
      id: 'prep-1',
      applicationId: 'app-1',
      payload: {},
      reusableAnswers: [],
      missingInformation: [] as string[],
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };
}
describe('ApplicationEligibilityService', () => {
  it('separa elegibilidade da política dos bloqueios operacionais', async () => {
    const db = {
      application: {
        findUnique: vi.fn().mockResolvedValue(eligibleApplication()),
        count: vi.fn().mockResolvedValue(1),
      },
    } as unknown as PrismaClient;

    const result = await new ApplicationEligibilityService(db, true).evaluate(
      'app-1',
      new Date('2026-10-03T12:00:00Z'),
    );

    expect(result.policyEligible).toBe(true);
    expect(result.automaticSubmissionAllowed).toBe(false);
    expect(result.reasons).toEqual([]);
    expect(result.automationBlockers).toEqual(
      expect.arrayContaining([
        'SAFE_MODE está ativo',
        'Nenhum provider de submissão externa autorizado foi configurado',
      ]),
    );
  });
  it('explica bloqueios de política e dados pendentes', async () => {
    const application = eligibleApplication();
    application.matchScore = 70;
    application.candidate.policy.blockedCompanies = ['Tech'];
    application.preparation.missingInformation = ['Telefone do candidato não informado'];
    const db = {
      application: {
        findUnique: vi.fn().mockResolvedValue(application),
        count: vi.fn().mockResolvedValue(5),
      },
    } as unknown as PrismaClient;

    const result = await new ApplicationEligibilityService(db, false).evaluate('app-1');

    expect(result.policyEligible).toBe(false);
    expect(result.reasons.join(' | ')).toContain('Score abaixo do mínimo');
    expect(result.reasons.join(' | ')).toContain('Empresa bloqueada');
    expect(result.reasons.join(' | ')).toContain('Pacote possui informações pendentes');
    expect(result.reasons.join(' | ')).toContain('Limite diário atingido');
  });
});

describe('restrições obrigatórias de envio', () => {
  it.each(['inactive', 'unanalysed', 'hardConstraint', 'noMatch', 'demo'] as const)(
    'bloqueia %s mesmo com score alto e provider',
    async (scenario) => {
      const application = {
        ...eligibleApplication(),
        candidate: { ...eligibleApplication().candidate, isDemo: scenario === 'demo' },
      };
      if (scenario === 'inactive') application.job.isActive = false;
      if (scenario === 'unanalysed') application.job.status = 'PENDING_ANALYSIS';
      if (scenario === 'hardConstraint')
        application.job.matches[0]!.hardConstraints = ['Formação obrigatória não atendida'];
      if (scenario === 'noMatch') application.job.matches = [];
      const db = {
        application: {
          findUnique: vi.fn().mockResolvedValue(application),
          count: vi.fn().mockResolvedValue(0),
        },
      } as unknown as PrismaClient;
      const result = await new ApplicationEligibilityService(db, false, () => true).evaluate(
        'app-1',
      );
      expect(result.automaticSubmissionAllowed).toBe(false);
      expect(result.reasons.length).toBeGreaterThan(0);
    },
  );
});
