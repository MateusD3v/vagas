import { describe, expect, it, vi } from 'vitest';
import { fetchSejaTraineeArticles, parseSejaTraineeFeed } from '../src/modules/sources/seja-trainee-feed.js';

const rss = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Seja Trainee</title>
  <item><title><![CDATA[Programa Trainee em Tecnologia &amp; Dados]]></title>
  <link>https://sejatrainee.com.br/trainee-empresa-vagas-abertas/</link>
  <pubDate>Sat, 10 Oct 2026 12:00:00 +0000</pubDate>
  <description><![CDATA[<p>Confira os detalhes e o link oficial de inscrição.</p>]]></description></item>
  <item><title>Link externo</title><link>https://site-desconhecido.example/vaga</link></item>
</channel></rss>`;

describe('Seja Trainee public RSS discovery', () => {
  it('lê matérias do domínio oficial, preserva fonte e não as trata como vagas confirmadas', () => {
    expect(parseSejaTraineeFeed(rss)).toEqual([
      {
        title: 'Programa Trainee em Tecnologia & Dados',
        url: 'https://sejatrainee.com.br/trainee-empresa-vagas-abertas/',
        publishedAt: '2026-10-10T12:00:00.000Z',
        excerpt: 'Confira os detalhes e o link oficial de inscrição.',
      },
    ]);
  });

  it('rejeita feed inválido', () => {
    expect(() => parseSejaTraineeFeed('<html>Login</html>')).toThrow('inválido');
  });

  it('consome apenas o feed público autorizado', async () => {
    const http = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(rss, { status: 200, headers: { 'content-type': 'application/rss+xml' } }),
    );
    const articles = await fetchSejaTraineeArticles(http);
    expect(articles).toHaveLength(1);
    expect(http.mock.calls[0]?.[0]).toBe('https://sejatrainee.com.br/feed/');
    expect(http.mock.calls[0]?.[1]).toMatchObject({ redirect: 'error' });
  });
});
