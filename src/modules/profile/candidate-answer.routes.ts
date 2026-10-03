import type { FastifyInstance } from 'fastify';
import { prisma } from '../../database/client.js';
import { adminRateLimit, requireAdmin } from '../../shared/admin-security.js';
import { idParamsSchema } from '../../shared/http.js';
import { CandidateAnswerService } from './candidate-answer.service.js';
import { answerSchema } from './profile.schemas.js';

export function candidateAnswerRoutes(app: FastifyInstance): void {
  const service = new CandidateAnswerService(prisma);

  app.get(
    '/candidate-answers',
    { schema: { tags: ['Profile'], summary: 'Lista respostas reutilizáveis do candidato' } },
    () => service.list(),
  );

  app.post(
    '/candidate-answers',
    {
      preHandler: requireAdmin,
      config: { rateLimit: adminRateLimit },
      schema: {
        tags: ['Profile'],
        summary: 'Cria ou atualiza resposta por questionKey',
        security: [{ adminKey: [] }],
      },
    },
    (request) => service.upsert(answerSchema.parse(request.body)),
  );
  app.put(
    '/candidate-answers/:id',
    {
      preHandler: requireAdmin,
      config: { rateLimit: adminRateLimit },
      schema: {
        tags: ['Profile'],
        summary: 'Atualiza uma resposta reutilizável',
        security: [{ adminKey: [] }],
      },
    },
    (request) =>
      service.update(idParamsSchema.parse(request.params).id, answerSchema.parse(request.body)),
  );

  app.delete(
    '/candidate-answers/:id',
    {
      preHandler: requireAdmin,
      config: { rateLimit: adminRateLimit },
      schema: {
        tags: ['Profile'],
        summary: 'Remove uma resposta reutilizável',
        security: [{ adminKey: [] }],
      },
    },
    async (request, reply) => {
      await service.remove(idParamsSchema.parse(request.params).id);
      return reply.code(204).send();
    },
  );
}
