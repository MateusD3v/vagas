export type AssistedPortal =
  'LINKEDIN' | 'INDEED' | 'GLASSDOOR' | 'VAGASCOM' | 'INFOJOBS' | 'CATHO' | 'SEJATRAINEE';

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

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function infoJobsTerm(value: string): string {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '+')
    .replace(/^\++|\++$/g, '');
  return encodeURIComponent(normalized);
}

function infoJobsLocation(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = slugify(value);
  if (normalized === 'belem') return 'belem%2C-pa';
  if (normalized === 'ananindeua') return 'ananindeua%2C-pa';
  return undefined;
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

function vagasComUrl(query: string, location?: string): string {
  const querySlug = slugify(query);
  const locationSlug = location ? slugify(location) : '';
  return locationSlug
    ? `https://www.vagas.com.br/vagas-de-${querySlug}-em-${locationSlug}`
    : `https://www.vagas.com.br/vagas-de-${querySlug}`;
}

function infoJobsUrl(query: string, location?: string): string {
  const term = infoJobsTerm(query);
  const locationPart = infoJobsLocation(location);
  return locationPart
    ? `https://www.infojobs.com.br/vagas-de-emprego-${term}-em-${locationPart}.aspx`
    : `https://www.infojobs.com.br/vagas-de-emprego-${term}.aspx`;
}

function cathoUrl(query: string, location?: string): string {
  const querySlug = slugify(query);
  const locationSlug = location ? slugify(location) : '';
  const locationPart = locationSlug
    ? locationSlug === 'belem' || locationSlug === 'ananindeua'
      ? `${locationSlug}-pa`
      : locationSlug
    : '';
  return locationPart
    ? `https://www.catho.com.br/vagas/${querySlug}/${locationPart}/`
    : `https://www.catho.com.br/vagas/${querySlug}/`;
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
      links.push({
        portal: 'VAGASCOM',
        label: location ? `${query} · ${location}` : query,
        query,
        ...(location ? { location } : {}),
        url: vagasComUrl(query, location),
      });
      links.push({
        portal: 'INFOJOBS',
        label: location ? `${query} · ${location}` : query,
        query,
        ...(location ? { location } : {}),
        url: infoJobsUrl(query, location),
      });
      links.push({
        portal: 'CATHO',
        label: location ? `${query} · ${location}` : query,
        query,
        ...(location ? { location } : {}),
        url: cathoUrl(query, location),
      });
    }
  }

  // Editorial listings are discovery sources, never evidence of a submitted application.
  links.push({
    portal: 'SEJATRAINEE',
    label: 'Seja Trainee · Programas recentes',
    query: 'trainee',
    url: 'https://sejatrainee.com.br/trainee/',
  });
  links.push({
    portal: 'SEJATRAINEE',
    label: 'Seja Trainee · Inscrições abertas',
    query: 'trainee',
    url: 'https://sejatrainee.com.br/vagas-de-trainee-com-inscricoes-abertas/',
  });

  return {
    generatedAt: now.toISOString(),
    links,
  };
}
