import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../config/env.js';

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!env.ADMIN_API_KEY && env.NODE_ENV !== 'production') return;
  const provided = request.headers['x-admin-key'];
  if (!env.ADMIN_API_KEY || provided !== env.ADMIN_API_KEY) {
    await reply.code(401).send({ error: 'Unauthorized', message: 'X-Admin-Key inválido' });
  }
}

export const adminRateLimit = { max: 5, timeWindow: '1 minute' };
