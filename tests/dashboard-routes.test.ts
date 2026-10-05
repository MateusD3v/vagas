import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { dashboardRoutes } from '../src/modules/dashboard/dashboard.routes.js';

const apps: Array<ReturnType<typeof Fastify>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('dashboard de fontes', () => {
  it('exibe saúde das fontes e controles de coleta', async () => {
    const app = Fastify();
    apps.push(app);
    dashboardRoutes(app);

    const response = await app.inject({ method: 'GET', url: '/dashboard' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('Fontes de vagas');
    expect(response.body).toContain('Executar coleta agora');
    expect(response.body).toContain("api('/job-sources?pageSize=50')");
    expect(response.body).toContain("data-run-source");
    expect(response.body).toContain("api('/job-sources/run', { method: 'POST' })");
  });
});
