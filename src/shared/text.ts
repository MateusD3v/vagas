export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .trim();
}

export function sameText(a: string, b: string): boolean {
  return normalizeText(a) === normalizeText(b);
}

export function includesText(haystack: string, needle: string): boolean {
  return normalizeText(haystack).includes(normalizeText(needle));
}
