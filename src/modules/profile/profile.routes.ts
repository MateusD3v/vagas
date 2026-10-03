import type { FastifyInstance } from 'fastify';
import { prisma } from '../../database/client.js';
import { profileCreateSchema, profilePatchSchema, profileUpdateSchema } from './profile.schemas.js';
import { ProfileService } from './profile.service.js';

export function profileRoutes(app: FastifyInstance): void {
  const service = new ProfileService(prisma);

  app.get('/profile', { schema: { tags: ['Profile'], summary: 'Retorna o perfil ativo' } }, () =>
    service.get(),
  );

  app.post(
    '/profile',
    { schema: { tags: ['Profile'], summary: 'Cadastra o perfil único' } },
    async (request, reply) => {
      const result = await service.create(profileCreateSchema.parse(request.body));
      return reply.code(201).send(result);
    },
  );

  app.put(
    '/profile',
    { schema: { tags: ['Profile'], summary: 'Substitui o perfil ativo' } },
    (request) => service.replace(profileUpdateSchema.parse(request.body)),
  );

  app.patch(
    '/profile',
    { schema: { tags: ['Profile'], summary: 'Atualiza parcialmente o perfil ativo' } },
    (request) => service.patch(profilePatchSchema.parse(request.body)),
  );
}
