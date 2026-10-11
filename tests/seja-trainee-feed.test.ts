import { expect, it } from 'vitest';
import { parseSejaTraineeFeed } from '../src/modules/sources/seja-trainee-feed.js';

it('lê o RSS público e ignora links de outros domínios', () => {
  const feed = [
    '<rss><channel>',
    '<item><title>Programa Trainee &amp; Tecnologia</title>',
    '<link>https://sejatrainee.com.br/trainee-vagas-abertas/</link>',
    '<pubDate>Sat, 10 Oct 2026 12:00:00 +0000</pubDate></item>',
    '<item><title>Externo</title>',
    '<link>https://outro.example/vaga</link></item>',
    '</channel></rss>',
  ].join('');
  const articles = parseSejaTraineeFeed(feed);
  expect(articles).toHaveLength(1);
  expect(articles[0]?.title).toBe('Programa Trainee & Tecnologia');
  expect(articles[0]?.url).toBe('https://sejatrainee.com.br/trainee-vagas-abertas/');
  expect(articles[0]?.publishedAt).toBe('2026-10-10T12:00:00.000Z');
});

it('recusa HTML no lugar de RSS', () => {
  expect(() => parseSejaTraineeFeed('<html>Login</html>')).toThrow('inválido');
});
