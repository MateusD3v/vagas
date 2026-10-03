import type { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../database/client.js';
import { paginationMeta, paginationSchema } from '../../shared/http.js';

const auditQuerySchema = paginationSchema.extend({
  event: z.string().min(1).max(100).optional(),
  entityType: z.string().min(1).max(100).optional(),
  entityId: z.string().min(1).max(200).optional(),
});

export function auditRoutes(app: FastifyInstance): void {
  app.get(
    '/audit-logs',
    {
      schema: {
        tags: ['Audit'],
        summary: 'Lista eventos de auditoria em ordem cronológica inversa',
        security: [{ adminKey: [] }],
      },
    },
    async (request) => {
      const query = auditQuerySchema.parse(request.query);
      const where: Prisma.AuditLogWhereInput = {
        ...(query.event ? { event: query.event } : {}),
        ...(query.entityType ? { entityType: query.entityType } : {}),
        ...(query.entityId ? { entityId: query.entityId } : {}),
      };
      const [items, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        prisma.auditLog.count({ where }),
      ]);
      return { data: items, meta: paginationMeta(total, query.page, query.pageSize) };
    },
  );
}
