export type AssistedPortal = 'LINKEDIN' | 'INDEED' | 'GLASSDOOR';

export interface PortalSearchProfileInput {
  keywords: string[];
  locations: string[];
}

export interface PortalSearchLink {
  portal: AssistedPortal;
  label: string;
  query: string;
  location?: string;
  url: string;
}

export interface PortalSearchPlan {
  generatedAt: string;
  links: PortalSearchLink[];
}

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLocaleLowerCase('pt-BR');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function searchLocations(values: string[]): string[] {
  const locations = uniqueNonEmpty(values);
  const preferred = locations.filter(
    (value) => !/^(remoto|remote|home office|home-office)$/i.test(value),
  );
  return (preferred.length ? preferred : locations).slice(0, 2);
}

function encode(value: string): string {
  return encodeURIComponent(value);
}

function linkedinUrl(query: string, location?: string): string {
  const params = new URLSearchParams({ keywords: query });
  if (location) params.set('location', location);
  return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
}

function indeedUrl(query: string, location?: string): string {
  const params = new URLSearchParams({ q: query });
  if (location) params.set('l', location);
  return `https://br.indeed.com/jobs?${params.toString()}`;
}

function glassdoorUrl(query: string, location?: string): string {
  const locationTerm = location ? ` ${location}` : '';
  return `https://www.glassdoor.com.br/Vaga/index.htm?sc.keyword=${encode(
    `${query}${locationTerm}`,
  )}`;
}

export function buildPortalSearchPlan(
  profile: PortalSearchProfileInput,
  now = new Date(),
): PortalSearchPlan {
  const keywords = uniqueNonEmpty(profile.keywords).slice(0, 4);
  const locations = searchLocations(profile.locations);
  const queries = keywords.length ? keywords : ['Suporte TI'];
  const effectiveLocations = locations.length ? locations : [undefined];
  const links: PortalSearchLink[] = [];

  for (const query of queries) {
    for (const location of effectiveLocations) {
      links.push({
        portal: 'LINKEDIN',
        label: location ? `${query} · ${location}` : query,
        query,
        ...(location ? { location } : {}),
        url: linkedinUrl(query, location),
      });
      links.push({
        portal: 'INDEED',
        label: location ? `${query} · ${location}` : query,
        query,
        ...(location ? { location } : {}),
        url: indeedUrl(query, location),
      });
      links.push({
        portal: 'GLASSDOOR',
        label: location ? `${query} · ${location}` : query,
        query,
        ...(location ? { location } : {}),
        url: glassdoorUrl(query, location),
      });
    }
  }

  return {
    generatedAt: now.toISOString(),
    links,
  };
}
