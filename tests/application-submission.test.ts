import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { SubmissionProvider } from '../src/integrations/submission/submission.interface.js';
import { SubmissionProviderRegistry } from '../src/integrations/submission/submission.registry.js';
import { ApplicationSubmissionService } from '../src/modules/applications/application-submission.service.js';

function applicationFixture() {
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
    job: {
      id: 'job-1',
      source: 'authorized-ats',
      title: 'Backend Jr',
      company: 'Tech Co',
      description: 'Node.js',
      remoteType: 'REMOTE',
      salaryMin: null,
      salaryMax: null,
      applicationUrl: 'https://ats.example.test/jobs/1',
    },
    preparation: {
      id: 'prep-1',
      applicationId: 'app-1',
      payload: { resumeMarkdown: '# Mateus Teste' },
      reusableAnswers: [],
      missingInformation: [],
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    candidate: {
      id: 'candidate-1',
      policy: {
        id: 'policy-1',
        candidateId: 'candidate-1',
        autoApplyEnabled: true,
        minimumScore: 85,
        maximumApplicationsPerDay: 5,
        allowedSources: ['authorized-ats'],
        blockedCompanies: [],
        blockedKeywords: [],
        requireSalaryInformation: false,
        requireRemote: true,
      },
    },
  };
}

function provider(): { provider: SubmissionProvider; submit: ReturnType<typeof vi.fn> } {
  const submit = vi.fn().mockResolvedValue({
    externalApplicationId: 'external-123',
    submittedAt: new Date('2026-10-03T12:00:00Z'),
    metadata: { mode: 'test' },
  });
  return {
    provider: {
      id: 'authorized-test-provider',
      supports: () => true,
      submit,
    },
    submit,
  };
}
describe('ApplicationSubmissionService', () => {
  it('bloqueia submissão quando SAFE_MODE está ativo', async () => {
    const submitProvider = provider();
    const db = {
      application: {
        findUnique: vi.fn().mockResolvedValue(applicationFixture()),
        count: vi.fn().mockResolvedValue(0),
        update: vi.fn(),
      },
      auditLog: { create: vi.fn() },
    } as unknown as PrismaClient;

    const service = new ApplicationSubmissionService(
      db,
      true,
      new SubmissionProviderRegistry([submitProvider.provider]),
    );

    await expect(service.submit('app-1')).rejects.toMatchObject({ statusCode: 409 });
    expect(submitProvider.submit).not.toHaveBeenCalled();
  });

  it('submete somente via provider registrado e grava identificador externo', async () => {
    const submitProvider = provider();
    const application = applicationFixture();
    const update = vi
      .fn()
      .mockImplementation(({ data }) => Promise.resolve({ ...application, ...data }));
    const audit = vi.fn().mockResolvedValue({ id: 'audit-1' });
    const db = {
      application: {
        findUnique: vi.fn().mockResolvedValue(application),
        count: vi.fn().mockResolvedValue(0),
        update,
      },
      auditLog: { create: audit },
    } as unknown as PrismaClient;
    const service = new ApplicationSubmissionService(
      db,
      false,
      new SubmissionProviderRegistry([submitProvider.provider]),
    );
    const result = await service.submit('app-1');

    expect(submitProvider.submit).toHaveBeenCalledOnce();
    expect(result.status).toBe('SUBMITTED');
    expect(result.applicationMethod).toBe('AUTOMATED:authorized-test-provider');
    expect(result.externalApplicationId).toBe('external-123');
    expect(update).toHaveBeenCalledOnce();
    expect(audit).toHaveBeenCalledOnce();
  });
});
