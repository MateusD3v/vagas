import { normalizeText } from '../../../shared/text.js';

const knownSkills = [
  'Node.js',
  'Java',
  'Flutter',
  'MySQL',
  'PostgreSQL',
  'Docker',
  'Git',
  'REST API',
  'Linux',
  'Windows',
  'Redes',
  'Hardware',
  'TypeScript',
  'JavaScript',
  'React',
  'Python',
  'AWS',
];

export function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function inferSeniority(title: string): string | undefined {
  const normalized = normalizeText(title);
  if (/\b(intern|internship|estagio)\b/.test(normalized)) return 'INTERN';
  if (/\b(trainee|entry|junior|jr)\b/.test(normalized)) return 'JUNIOR';
  if (/\b(senior|sr|staff|principal|lead)\b/.test(normalized)) return 'SENIOR';
  if (/\b(mid|midweight|midlevel|pleno|intermediate)\b/.test(normalized)) return 'MID';
  return undefined;
}

function normalizeSkillSearchText(value: string): string {
  return normalizeText(value)
    .split(/\s+/)
    .map((token) => token.replace(/^\.+|\.+$/g, ''))
    .filter(Boolean)
    .join(' ');
}

function containsNormalizedTerm(haystack: string, term: string): boolean {
  const normalized = normalizeSkillSearchText(term);
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\s)${escaped}(?:$|\\s)`).test(haystack);
}

export function extractKnownSkills(title: string, description: string, tags: string[] = []) {
  const haystack = normalizeSkillSearchText(`${title} ${description} ${tags.join(' ')}`);
  return knownSkills
    .filter((skill) => containsNormalizedTerm(haystack, skill))
    .map((skill) => ({ skill, required: false }));
}

export function safeRawData(
  value: Record<string, unknown>,
  maxBytes: number,
): Record<string, unknown> {
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, 'utf8') <= maxBytes) return value;
  return { truncated: true, originalBytes: Buffer.byteLength(serialized, 'utf8') };
}
