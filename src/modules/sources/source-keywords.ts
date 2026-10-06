const GLOBAL_REMOTE_SOURCES = new Set(['remotive', 'jobicy', 'himalayas']);

const aliases: Array<{ pattern: RegExp; replacement: string }> = [
  {
    pattern: /^(analista de suporte|suporte técnico|suporte tecnico)$/i,
    replacement: 'Technical Support',
  },
  { pattern: /^(suporte ti|suporte de ti)$/i, replacement: 'IT Support' },
  { pattern: /^analista de ti$/i, replacement: 'IT Analyst' },
  { pattern: /^desenvolvedor(a)? backend$/i, replacement: 'Backend Developer' },
  {
    pattern: /^desenvolvedor(a)? júnior$|^desenvolvedor(a)? junior$/i,
    replacement: 'Junior Developer',
  },
  { pattern: /^desenvolvedor(a)? java$/i, replacement: 'Java Developer' },
  { pattern: /^desenvolvedor(a)? flutter$/i, replacement: 'Flutter Developer' },
  {
    pattern: /^(estágio|estagio).*(desenvolvimento|software|ti|sistemas)$/i,
    replacement: 'Software Engineering Intern',
  },
];

function normalizeAlias(keyword: string): string {
  const trimmed = keyword.trim();
  const alias = aliases.find(({ pattern }) => pattern.test(trimmed));
  return alias?.replacement ?? trimmed;
}

function dedupeCaseInsensitive(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLocaleLowerCase('en-US');
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function sourceSearchKeywords(sourceSlug: string, keywords: string[]): string[] {
  if (!GLOBAL_REMOTE_SOURCES.has(sourceSlug)) return [...keywords];
  return dedupeCaseInsensitive(keywords.map(normalizeAlias));
}
