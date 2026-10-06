import { runInNewContext } from 'node:vm';
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { dashboardRoutes } from '../src/modules/dashboard/dashboard.routes.js';

type FetchResponse = { ok: boolean; json: () => Promise<unknown> };
type TestFetch = (path: string, options: { body?: string }) => Promise<FetchResponse>;
function importedBody(body: string | undefined): Record<string, unknown> {
  return JSON.parse(body ?? '{}') as Record<string, unknown>;
}

type Handler = () => Promise<void> | void;

async function dashboardHarness() {
  const app = Fastify();
  dashboardRoutes(app);
  const response = await app.inject({ method: 'GET', url: '/dashboard' });
  await app.close();
  const script = response.body.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  if (!script) throw new Error('Dashboard script missing');
  const elements = new Map<
    string,
    {
      value: string;
      checked: boolean;
      textContent: string;
      className: string;
      handlers: Record<string, Handler>;
      addEventListener: (event: string, handler: Handler) => void;
      setAttribute: () => void;
      removeAttribute: () => void;
    }
  >();
  function element(id: string) {
    if (!elements.has(id)) {
      const handlers: Record<string, Handler> = {};
      elements.set(id, {
        value: '',
        checked: false,
        textContent: '',
        className: '',
        handlers,
        addEventListener: (event, handler) => {
          handlers[event] = handler;
        },
        setAttribute: () => {},
        removeAttribute: () => {},
      });
    }
    return elements.get(id)!;
  }
  const fetch = vi.fn<TestFetch>().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
  const context = {
    document: { getElementById: element, addEventListener: () => {} },
    sessionStorage: { getItem: () => '', setItem: () => {} },
    fetch,
    URL,
  };
  runInNewContext(script, context);
  // Only test the intake flow; the periodic dashboard fetches are unrelated.
  runInNewContext('refresh = async () => {};', context);
  element('manualTitle').value = 'Analista de Suporte';
  element('manualCompany').value = 'Example';
  element('manualDescription').value = 'Suporte técnico';
  element('manualRemoteType').value = 'REMOTE';
  return { element, fetch };
}

const questions = [{ label: 'Disponibilidade', required: true, fields: [] }];
const firstUrl = 'https://boards.greenhouse.io/example/jobs/123';
const secondUrl = 'https://br.indeed.com/viewjob?jk=456';

describe('dashboard manual intake', () => {
  it('leva data de publicação e contratação públicas à importação e permite revisão', async () => {
    const { element, fetch } = await dashboardHarness();
    element('manualUrl').value = firstUrl;
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          supported: true,
          data: {
            applicationUrl: firstUrl,
            employmentType: 'FULL_TIME',
            publishedAt: '2026-09-01T10:00:00.000Z',
          },
        }),
    });
    await element('resolveUrl').handlers.click?.();
    expect(element('manualEmploymentType').value).toBe('FULL_TIME');
    expect(element('manualPublishedAt').value).toBe('2026-09-01');
    element('manualEmploymentType').value = 'CLT';
    await element('manualImport').handlers.click?.();
    expect(importedBody(fetch.mock.calls[1]?.[1].body)).toMatchObject({
      employmentType: 'CLT',
      publishedAt: '2026-09-01',
    });
    expect(element('manualEmploymentType').value).toBe('');
    expect(element('manualPublishedAt').value).toBe('');
  });

  it('descarta metadados ao trocar a vaga e mantém data ausente sem inventar uma', async () => {
    const { element, fetch } = await dashboardHarness();
    element('manualUrl').value = firstUrl;
    element('manualEmploymentType').value = 'CLT';
    element('manualPublishedAt').value = '2026-09-01';
    element('manualUrl').value = secondUrl;
    await element('manualUrl').handlers.input?.();
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          supported: true,
          data: { applicationUrl: secondUrl, publishedAt: 'invalid-date' },
        }),
    });
    await element('resolveUrl').handlers.click?.();
    await element('manualImport').handlers.click?.();
    const body = importedBody(fetch.mock.calls[1]?.[1].body);
    expect(body).not.toHaveProperty('employmentType');
    expect(body).not.toHaveProperty('publishedAt');
  });

  it('mantém perguntas ligadas à URL canônica retornada pelo resolvedor', async () => {
    const { element, fetch } = await dashboardHarness();
    element('manualUrl').value = firstUrl;
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          applicationQuestions: questions,
          data: { applicationUrl: secondUrl },
          supported: true,
        }),
    });
    await element('resolveUrl').handlers.click?.();
    await element('manualImport').handlers.click?.();
    const body = importedBody(fetch.mock.calls[1]?.[1].body);
    expect(body.applicationUrl).toBe(secondUrl);
    expect(body.applicationQuestions).toEqual(questions);
  });

  it('não importa perguntas da vaga anterior depois de trocar o link', async () => {
    const { element, fetch } = await dashboardHarness();
    element('manualUrl').value = firstUrl;
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          applicationQuestions: questions,
          supported: true,
        }),
    });
    await element('resolveUrl').handlers.click?.();
    element('manualUrl').value = secondUrl;
    await element('manualUrl').handlers.input?.();
    await element('manualImport').handlers.click?.();
    expect(importedBody(fetch.mock.calls[1]?.[1].body).applicationQuestions).toEqual([]);
  });

  it('ignora resposta atrasada quando o usuário troca a URL durante a consulta', async () => {
    const { element, fetch } = await dashboardHarness();
    element('manualUrl').value = firstUrl;
    let finish!: (response: FetchResponse) => void;
    fetch.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const pending = element('resolveUrl').handlers.click?.();
    element('manualUrl').value = secondUrl;
    await element('manualUrl').handlers.input?.();
    finish({
      ok: true,
      json: () =>
        Promise.resolve({
          applicationQuestions: questions,
          data: { title: 'Cargo da vaga anterior', applicationUrl: firstUrl },
          supported: true,
        }),
    });
    await pending;
    expect(element('manualUrl').value).toBe(secondUrl);
    expect(element('manualTitle').value).toBe('Analista de Suporte');
    await element('manualImport').handlers.click?.();
    expect(importedBody(fetch.mock.calls[1]?.[1].body).applicationQuestions).toEqual([]);
  });
});
