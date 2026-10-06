import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { dashboardRoutes } from '../src/modules/dashboard/dashboard.routes.js';

describe('dashboard de fontes', () => {
  it('exibe saúde das fontes e controles de coleta', async () => {
    const app = Fastify();
    try {
      dashboardRoutes(app);

      const response = await app.inject({ method: 'GET', url: '/dashboard' });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.body).toContain('Próximas ações');
      expect(response.body).toContain('id="actionQueue"');
      expect(response.body).toContain('id="applicationFilter"');
      expect(response.body).toContain('renderActionQueue');
      expect(response.body).toContain('data-fast-kit');
      expect(response.body).toContain('Ver na fonte');
      expect(response.body).toContain('Portais principais');
      expect(response.body).toContain('Buscas assistidas');
      expect(response.body).toContain('id="portalSearchPlan"');
      expect(response.body).toContain('renderPortalSearchPlan');
      expect(response.body).toContain("api('/portal-search-plan')");
      expect(response.body).toContain('Gupy');
      expect(response.body).toContain('Sólides');
      expect(response.body).toContain('LinkedIn');
      expect(response.body).toContain('Indeed');
      expect(response.body).toContain('Glassdoor');
      expect(response.body).toContain('Painel web do pipeline de vagas e candidaturas');
      expect(response.body).toContain('Fontes de vagas');
      expect(response.body).toContain('Executar coleta agora');
      expect(response.body).toContain("api('/job-sources?pageSize=50')");
      expect(response.body).toContain('data-run-source');
      expect(response.body).toContain("api('/job-sources/run', { method: 'POST' })");
    } finally {
      await app.close();
    }
  });
});
