export interface SejaTraineeArticle {
  title: string;
  url: string;
  publishedAt: string | null;
  excerpt: string;
}

const feedUrl = 'https://sejatrainee.com.br/feed/';

function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
}

function tagContent(xml: string, tag: string): string {
  const pattern = new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + tag + '>', 'i');
  return decodeEntities(xml.match(pattern)?.[1] ?? '').trim();
}

function plainText(value: string): string {
  return decodeEntities(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseSejaTraineeFeed(xml: string, limit = 12): SejaTraineeArticle[] {
  if (!/<rss(?:\s|>)/i.test(xml) || !/<channel(?:\s|>)/i.test(xml)) {
    throw new Error('Feed RSS do Seja Trainee inválido');
  }

  const articles: SejaTraineeArticle[] = [];
  const blocks = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) ?? [];
  for (const block of blocks) {
    const title = plainText(tagContent(block, 'title')).slice(0, 200);
    const link = tagContent(block, 'link');
    if (!title || !link) continue;
    let url: URL;
    try {
      url = new URL(link);
    } catch {
      continue;
    }
    if (
      url.protocol !== 'https:' ||
      !['sejatrainee.com.br', 'www.sejatrainee.com.br'].includes(url.hostname)
    ) {
      continue;
    }
    const dateText = tagContent(block, 'pubDate');
    const date = Date.parse(dateText);
    const publishedAt = Number.isFinite(date) ? new Date(date).toISOString() : null;
    const excerpt = plainText(tagContent(block, 'description')).slice(0, 500);
    articles.push({ title, url: url.toString(), publishedAt, excerpt });
    if (articles.length >= Math.min(Math.max(1, limit), 30)) break;
  }
  return articles;
}

export async function fetchSejaTraineeArticles(
  http: typeof fetch = fetch,
): Promise<SejaTraineeArticle[]> {
  const response = await http(feedUrl, {
    method: 'GET',
    headers: { accept: 'application/rss+xml, application/xml;q=0.9' },
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('Feed RSS indisponível');
  const xml = await response.text();
  if (xml.length > 1_000_000) throw new Error('Feed RSS muito grande');
  return parseSejaTraineeFeed(xml);
}
