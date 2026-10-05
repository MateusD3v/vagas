import type { FastifyInstance } from 'fastify';
import { prisma } from '../../database/client.js';
import { adminRateLimit, requireAdmin } from '../../shared/admin-security.js';
import { profileCreateSchema, profilePatchSchema, profileUpdateSchema } from './profile.schemas.js';
import { profileTransferBundleSchema } from './profile-transfer.schemas.js';
import { ProfileTransferService } from './profile-transfer.service.js';
import { ProfileService } from './profile.service.js';

export function profileRoutes(app: FastifyInstance): void {
  const service = new ProfileService(prisma);
  const transfer = new ProfileTransferService(prisma);

  app.get('/profile', { schema: { tags: ['Profile'], summary: 'Retorna o perfil ativo' } }, () =>
    service.get(),
  );

  app.get(
    '/profile/readiness',
    { schema: { tags: ['Profile'], summary: 'Mostra pendências para busca e matching' } },
    () => service.readiness(),
  );

  app.get(
    '/profile/export',
    {
      preHandler: requireAdmin,
      config: { rateLimit: adminRateLimit },
      schema: {
        tags: ['Profile'],
        summary: 'Exporta perfil e preferências para backup privado',
        security: [{ adminKey: [] }],
      },
    },
    async (_request, reply) => {
      const bundle = await transfer.exportBundle();
      return reply
        .header('content-disposition', 'attachment; filename="vagas-profile-backup.json"')
        .send(bundle);
    },
  );

  app.post(
    '/profile/import',
    {
      preHandler: requireAdmin,
      config: { rateLimit: adminRateLimit },
      schema: {
        tags: ['Profile'],
        summary: 'Importa backup privado do perfil e preferências',
        security: [{ adminKey: [] }],
      },
    },
    (request) => transfer.importBundle(profileTransferBundleSchema.parse(request.body)),
  );

  app.post(
    '/profile',
    {
      preHandler: requireAdmin,
      config: { rateLimit: adminRateLimit },
      schema: { tags: ['Profile'], summary: 'Cadastra o perfil único', security: [{ adminKey: [] }] },
    },
    async (request, reply) => {
      const result = await service.create(profileCreateSchema.parse(request.body));
      return reply.code(201).send(result);
    },
  );

  app.put(
    '/profile',
    {
      preHandler: requireAdmin,
      config: { rateLimit: adminRateLimit },
      schema: { tags: ['Profile'], summary: 'Substitui o perfil ativo', security: [{ adminKey: [] }] },
    },
    (request) => service.replace(profileUpdateSchema.parse(request.body)),
  );

  app.patch(
    '/profile',
    {
      preHandler: requireAdmin,
      config: { rateLimit: adminRateLimit },
      schema: { tags: ['Profile'], summary: 'Atualiza parcialmente o perfil ativo', security: [{ adminKey: [] }] },
    },
    (request) => service.patch(profilePatchSchema.parse(request.body)),
  );
}
