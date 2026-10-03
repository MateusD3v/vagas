import { z } from 'zod';

export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const idParamsSchema = z.object({ id: z.string().uuid() });

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export function paginationMeta(total: number, page: number, pageSize: number) {
  return { page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}
