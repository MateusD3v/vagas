import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { env } from '../src/config/env.js';
import type { AppLogger } from '../src/shared/logger.js';
import {
  WorkerCycleService,
  type WorkerCycleDependencies,
} from '../src/workers/worker-cycle.service.js';

const logger: AppLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function dependencies(): WorkerCycleDependencies {
  return {
    collection: {
      runEnabled: vi.fn().mockResolvedValue([{ id: 'run-1' }]),
      resumePending: vi.fn().mockResolvedValue(2),
    },
    availabilitySync: {
      run: vi.fn().mockResolvedValue({
        sourcesChecked: 1,
        jobsChecked: 3,
        active: 2,
        closed: 1,
        unknown: 0,
        failures: 0,
      }),
    },
    applyUrlResolution: {
      resolvePending: vi.fn().mockResolvedValue({
        attempted: 2,
        resolved: 1,
        unchanged: 1,
        skipped: 0,
        failed: 0,
        failures: [],
      }),
    },
    atsEnrichment: {
      enrichPending: vi.fn().mockResolvedValue({
        attempted: 2,
        enriched: 2,
        supported: 1,
        questionsFound: 3,
        skipped: 0,
        failed: 0,
        failures: [],
      }),
    },
    applicationPreparation: {
      preparePending: vi.fn().mockResolvedValue({
        attempted: 1,
        prepared: 1,
        failed: 0,
        failures: [],
      }),
    },
    followUps: {
      scanDue: vi.fn().mockResolvedValue({ due: 1, applicationIds: ['application-1'] }),
    },
    notifications: [{ notifyFollowUpsDue: vi.fn().mockResolvedValue(undefined) }],
    retention: {
      run: vi.fn().mockResolvedValue({
        collectionRunsDeleted: 0,
        auditLogsDeleted: 0,
        jobsClosed: 0,
        jobsStale: 0,
      }),
    },
  };
}

describe('WorkerCycleService', () => {
  it('executa um ciclo único e termina em IDLE', async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const update = vi
      .fn<
        (args: { data: { status: string; metadata?: Record<string, unknown> } }) => Promise<object>
      >()
      .mockResolvedValue({});
    const markFollowUpsNotified = vi.fn().mockResolvedValue({ count: 1 });
    const db = {
      workerHeartbeat: { upsert, updateMany, update },
      application: { updateMany: markFollowUpsNotified },
    } as unknown as PrismaClient;
    const deps = dependencies();

    const result = await new WorkerCycleService(
      db,
      { ...env, ENABLE_SCHEDULER: true, AUTO_PREPARE_APPLICATIONS: true },
      logger,
      deps,
    ).run('test');

    expect(result.started).toBe(true);
    expect(result.collectionRuns).toBe(1);
    expect(result.resumed).toBe(2);
    expect(deps.collection.runEnabled).toHaveBeenCalledOnce();
    expect(deps.applyUrlResolution.resolvePending).toHaveBeenCalledWith(
      env.APPLICATION_PREPARATION_BATCH_SIZE,
    );
    expect(deps.atsEnrichment.enrichPending).toHaveBeenCalledWith(
      env.APPLICATION_PREPARATION_BATCH_SIZE,
    );
    expect(deps.applicationPreparation.preparePending).toHaveBeenCalledWith(
      env.APPLICATION_PREPARATION_BATCH_SIZE,
    );
    expect(deps.followUps.scanDue).toHaveBeenCalledOnce();
    expect(deps.notifications?.[0]?.notifyFollowUpsDue).toHaveBeenCalledWith(['application-1']);
    expect(markFollowUpsNotified).toHaveBeenCalledWith({
      where: { id: { in: ['application-1'] } },
      data: { followUpNotifiedAt: expect.any(Date) as Date },
    });
    expect(result.applyUrlResolution).toMatchObject({
      attempted: 2,
      resolved: 1,
    });
    expect(result.atsEnrichment).toMatchObject({
      attempted: 2,
      enriched: 2,
      questionsFound: 3,
    });
    expect(result.followUps).toEqual({ due: 1, applicationIds: ['application-1'] });
    expect(update).toHaveBeenCalled();
    expect(update.mock.calls.some(([call]) => call.data.status === 'RUNNING')).toBe(true);
    const idleUpdate = update.mock.calls.at(-1)?.[0];
    expect(idleUpdate?.data.status).toBe('IDLE');
  });

  it('não inicia segundo ciclo quando o lock já está RUNNING', async () => {
    const db = {
      workerHeartbeat: {
        upsert: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        update: vi.fn(),
      },
    } as unknown as PrismaClient;
    const deps = dependencies();

    const result = await new WorkerCycleService(db, env, logger, deps).run('duplicate');

    expect(result.started).toBe(false);
    expect(deps.collection.runEnabled).not.toHaveBeenCalled();
    expect(deps.collection.resumePending).not.toHaveBeenCalled();
    expect(deps.applyUrlResolution.resolvePending).not.toHaveBeenCalled();
    expect(deps.atsEnrichment.enrichPending).not.toHaveBeenCalled();
  });

  it('marca FAILED quando alguma etapa do ciclo falha', async () => {
    const update = vi
      .fn<
        (args: { data: { status: string; metadata?: Record<string, unknown> } }) => Promise<object>
      >()
      .mockResolvedValue({});
    const db = {
      workerHeartbeat: {
        upsert: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update,
      },
    } as unknown as PrismaClient;
    const deps = dependencies();
    vi.mocked(deps.collection.resumePending).mockRejectedValueOnce(new Error('boom'));

    await expect(new WorkerCycleService(db, env, logger, deps).run('failure')).rejects.toThrow(
      'boom',
    );

    expect(update).toHaveBeenCalled();
    const failedUpdate = update.mock.calls.at(-1)?.[0];
    expect(failedUpdate?.data.status).toBe('FAILED');
    expect(failedUpdate?.data.metadata).toMatchObject({ trigger: 'failure', error: 'boom' });
  });

  it('recupera lock legado de uma instância anterior após a janela de reinício', async () => {
    const now = new Date('2026-10-06T22:10:00.000Z');
    const lastSeenAt = new Date('2026-10-06T22:05:00.000Z');
    const findUnique = vi.fn().mockResolvedValue({
      workerName: 'job-collection-worker',
      status: 'RUNNING',
      lastSeenAt,
      metadata: { mode: 'cron', stage: 'resume' },
    });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const db = {
      workerHeartbeat: { findUnique, updateMany },
    } as unknown as PrismaClient;

    const recovered = await new WorkerCycleService(
      db,
      env,
      logger,
      dependencies(),
      'new-owner',
    ).recoverInterruptedCycle(new Date('2026-10-06T22:08:00.000Z'), now);

    expect(recovered).toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        workerName: 'job-collection-worker',
        status: 'RUNNING',
        lastSeenAt,
      },
      data: {
        status: 'FAILED',
        lastSeenAt: now,
        metadata: {
          mode: 'recovery',
          reason: 'PROCESS_RESTART',
          ownerId: 'new-owner',
        },
      },
    });
  });

  it('não recupera lock pertencente à própria instância', async () => {
    const lastSeenAt = new Date('2026-10-06T22:05:00.000Z');
    const updateMany = vi.fn();
    const db = {
      workerHeartbeat: {
        findUnique: vi.fn().mockResolvedValue({
          workerName: 'job-collection-worker',
          status: 'RUNNING',
          lastSeenAt,
          metadata: { ownerId: 'same-owner' },
        }),
        updateMany,
      },
    } as unknown as PrismaClient;

    const recovered = await new WorkerCycleService(
      db,
      env,
      logger,
      dependencies(),
      'same-owner',
    ).recoverInterruptedCycle(
      new Date('2026-10-06T22:08:00.000Z'),
      new Date('2026-10-06T22:10:00.000Z'),
    );

    expect(recovered).toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('não recupera nenhum lock durante o primeiro minuto da nova instância', async () => {
    const findUnique = vi.fn();
    const db = {
      workerHeartbeat: { findUnique, updateMany: vi.fn() },
    } as unknown as PrismaClient;

    const recovered = await new WorkerCycleService(
      db,
      env,
      logger,
      dependencies(),
      'new-owner',
    ).recoverInterruptedCycle(
      new Date('2026-10-06T22:09:30.000Z'),
      new Date('2026-10-06T22:10:00.000Z'),
    );

    expect(recovered).toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
