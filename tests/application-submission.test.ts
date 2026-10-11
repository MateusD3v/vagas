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
      isActive: true,
      status: 'ANALYZED',
      matches: [{ candidateId: 'candidate-1', decision: 'APPLY', hardConstraints: [] as string[] }],
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

  it('bloqueia nova submissão quando a candidatura já foi enviada', async () => {
    const submitProvider = provider();
    const db = {
      application: {
        findUnique: vi.fn().mockResolvedValue({
          status: 'SUBMITTED',
          submittedAt: new Date('2026-10-03T12:00:00Z'),
          externalApplicationId: 'external-123',
        }),
        count: vi.fn().mockResolvedValue(0),
        update: vi.fn(),
      },
      auditLog: { create: vi.fn() },
    } as unknown as PrismaClient;
    const service = new ApplicationSubmissionService(
      db,
      false,
      new SubmissionProviderRegistry([submitProvider.provider]),
    );

    await expect(service.submit('app-1')).rejects.toMatchObject({ statusCode: 409 });
    expect(submitProvider.submit).not.toHaveBeenCalled();
  });

  it('bloqueia a mesma vaga do Gmail quando outra fonte já reservou o mesmo anúncio', async () => {
    const submitted = provider();
    const applicant = {
      ...applicationFixture(),
      emailTarget: { evidenceUrl: 'https://empresa.example.test/vaga/123' },
    };
    const db = {
      application: {
        findUnique: vi.fn().mockResolvedValue(applicant),
        findFirst: vi.fn().mockResolvedValue({ id: 'another-source-application' }),
        count: vi.fn().mockResolvedValue(0),
      },
      submissionAttempt: { count: vi.fn().mockResolvedValue(0), create: vi.fn() },
      auditLog: { create: vi.fn() },
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'candidate-1' }]),
      $transaction: vi
        .fn()
        .mockImplementation((callback: (tx: object) => Promise<unknown>) => callback(db)),
    } as unknown as PrismaClient;
    const gmail = { ...submitted.provider, id: 'gmail' };
    const service = new ApplicationSubmissionService(
      db,
      false,
      new SubmissionProviderRegistry([gmail]),
    );
    await expect(service.submit('app-1')).rejects.toThrow(
      'Outra candidatura para este anúncio já foi enviada ou reservada',
    );
    expect(submitted.submit).not.toHaveBeenCalled();
    expect(db.submissionAttempt.create).not.toHaveBeenCalled();
  });

  it('submete somente via provider registrado e grava identificador externo', async () => {
    const submitProvider = provider();
    const application = applicationFixture();
    const update = vi
      .fn()
      .mockImplementation(({ data }) => Promise.resolve({ ...application, ...data }));
    const audit = vi.fn().mockResolvedValue({ id: 'audit-1' });
    const applicationEvent = vi.fn().mockResolvedValue({ id: 'event-1' });
    const db = {
      application: {
        findUnique: vi.fn().mockResolvedValue(application),
        count: vi.fn().mockResolvedValue(0),
        update,
      },
      applicationEvent: { create: applicationEvent },
      auditLog: { create: audit },
      submissionAttempt: { count: vi.fn().mockResolvedValue(0), create: vi.fn(), update: vi.fn() },
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'candidate-1' }]),
      $transaction: vi
        .fn()
        .mockImplementation((callback: (tx: object) => Promise<unknown>) => callback(db)),
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
    expect(result.nextFollowUpAt).toEqual(new Date('2026-10-10T12:00:00Z'));
    expect(update).toHaveBeenCalledOnce();
    expect(applicationEvent).toHaveBeenCalledWith({
      data: expect.objectContaining({
        applicationId: 'app-1',
        fromStatus: 'READY',
        toStatus: 'SUBMITTED',
        source: 'AUTOMATED:authorized-test-provider',
        externalApplicationId: 'external-123',
      }) as object,
    });
    expect(audit).toHaveBeenCalledTimes(2);
  });
});

function transactionalFixture(maximum = 5) {
  const first = applicationFixture();
  first.candidate.policy.maximumApplicationsPerDay = maximum;
  const apps = new Map([
    ['app-1', first],
    ['app-2', { ...first, id: 'app-2', jobId: 'job-2' }],
  ]);
  const attempts = new Map<string, { status: string }>();
  let tail = Promise.resolve();
  const audit = vi.fn().mockResolvedValue({});
  const db = {
    application: {
      findUnique: vi.fn(({ where }: { where: { id: string } }) => {
        const app = apps.get(where.id);
        return Promise.resolve(
          app ? { ...app, submissionAttempt: attempts.get(where.id) ?? null } : null,
        );
      }),
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn(({ where, data }: { where: { id: string }; data: object }) => {
        const app = { ...apps.get(where.id)!, ...data };
        apps.set(where.id, app);
        return Promise.resolve(app);
      }),
    },
    submissionAttempt: {
      count: vi.fn(() => Promise.resolve(attempts.size)),
      create: vi.fn(({ data }: { data: { applicationId: string; status: string } }) => {
        if (attempts.has(data.applicationId)) throw new Error('Unique violation');
        attempts.set(data.applicationId, { status: data.status });
        return Promise.resolve({});
      }),
      update: vi.fn(
        ({ where, data }: { where: { applicationId: string }; data: { status: string } }) => {
          attempts.set(where.applicationId, data);
          return Promise.resolve({});
        },
      ),
    },
    applicationEvent: { create: vi.fn().mockResolvedValue({}) },
    auditLog: { create: audit },
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'candidate-1' }]),
    $transaction: vi.fn(async (callback: (tx: object) => Promise<unknown>) => {
      // This fixture models serialized reservations; the production implementation uses a PostgreSQL row lock.
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await callback(db);
      } finally {
        release();
      }
    }),
  };
  return { db, attempts };
}

describe('durable submission reservations', () => {
  it('bloqueia duplicatas concorrentes enquanto a primeira chamada externa está pendente', async () => {
    const { db, attempts } = transactionalFixture();
    const submitProvider = provider();
    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    submitProvider.submit.mockImplementationOnce(async () => {
      await hold;
      return { externalApplicationId: 'message-1', submittedAt: new Date() };
    });
    const service = new ApplicationSubmissionService(
      db as unknown as PrismaClient,
      false,
      new SubmissionProviderRegistry([submitProvider.provider]),
    );
    const first = service.submit('app-1');
    await vi.waitFor(() => expect(submitProvider.submit).toHaveBeenCalledOnce());
    expect(attempts.get('app-1')?.status).toBe('PENDING');
    await expect(service.submit('app-1')).rejects.toMatchObject({ statusCode: 409 });
    expect(submitProvider.submit).toHaveBeenCalledOnce();
    release();
    await first;
    expect(attempts.get('app-1')?.status).toBe('SENT');
  });
  it('conta reservas pendentes no limite diário, inclusive para vagas diferentes', async () => {
    const { db } = transactionalFixture(1);
    const submitProvider = provider();
    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    submitProvider.submit.mockImplementationOnce(async () => {
      await hold;
      return { externalApplicationId: 'message-1', submittedAt: new Date() };
    });
    const service = new ApplicationSubmissionService(
      db as unknown as PrismaClient,
      false,
      new SubmissionProviderRegistry([submitProvider.provider]),
    );
    const first = service.submit('app-1');
    await vi.waitFor(() => expect(submitProvider.submit).toHaveBeenCalledOnce());
    await expect(service.submit('app-2')).rejects.toThrow('Limite diário de reservas');
    expect(db.submissionAttempt.create).toHaveBeenCalledOnce();
    release();
    await first;
  });
  it('persiste resultado desconhecido e impede repetição após timeout ou reinício', async () => {
    const { db, attempts } = transactionalFixture();
    const submitProvider = provider();
    submitProvider.submit.mockRejectedValueOnce(
      new Error('private upstream credential and timeout'),
    );
    const registry = new SubmissionProviderRegistry([submitProvider.provider]);
    await expect(
      new ApplicationSubmissionService(db as unknown as PrismaClient, false, registry).submit(
        'app-1',
      ),
    ).rejects.toThrow('Envio sem confirmação');
    expect(attempts.get('app-1')?.status).toBe('UNKNOWN');
    await expect(
      new ApplicationSubmissionService(db as unknown as PrismaClient, false, registry).submit(
        'app-1',
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(submitProvider.submit).toHaveBeenCalledOnce();
    expect(JSON.stringify(db.auditLog.create.mock.calls)).not.toContain('private upstream');
  });
  it('não realiza chamada externa se a reserva não puder ser gravada', async () => {
    const { db } = transactionalFixture();
    db.submissionAttempt.create.mockRejectedValueOnce(new Error('database unavailable'));
    const submitProvider = provider();
    const service = new ApplicationSubmissionService(
      db as unknown as PrismaClient,
      false,
      new SubmissionProviderRegistry([submitProvider.provider]),
    );
    await expect(service.submit('app-1')).rejects.toThrow('database unavailable');
    expect(submitProvider.submit).not.toHaveBeenCalled();
  });
  it('mantém reserva quando o banco falha depois de o serviço confirmar envio', async () => {
    const { db, attempts } = transactionalFixture();
    db.application.update.mockRejectedValueOnce(new Error('database unavailable'));
    const submitProvider = provider();
    const service = new ApplicationSubmissionService(
      db as unknown as PrismaClient,
      false,
      new SubmissionProviderRegistry([submitProvider.provider]),
    );
    await expect(service.submit('app-1')).rejects.toThrow('database unavailable');
    expect(attempts.get('app-1')?.status).toBe('PENDING');
    await expect(service.submit('app-1')).rejects.toMatchObject({ statusCode: 409 });
    expect(submitProvider.submit).toHaveBeenCalledOnce();
  });
});
