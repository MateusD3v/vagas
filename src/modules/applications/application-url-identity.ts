// Normalize only known tracking parameters. Job IDs and unknown query parameters are retained.
const trackingParameters = new Set([
  'fbclid',
  'gclid',
  'msclkid',
  'yclid',
  'mc_cid',
  'mc_eid',
  'igshid',
  'trk',
  'trackingid',
]);

export function applicationUrlIdentity(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;

  url.hash = '';
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';

  const preserved = [...url.searchParams.entries()]
    .filter(([key]) => {
      const normalized = key.toLowerCase();
      return !normalized.startsWith('utm_') && !trackingParameters.has(normalized);
    })
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      const byKey = leftKey.localeCompare(rightKey);
      return byKey || leftValue.localeCompare(rightValue);
    });
  url.search = '';
  for (const [key, paramValue] of preserved) url.searchParams.append(key, paramValue);
  return url.toString();
}
