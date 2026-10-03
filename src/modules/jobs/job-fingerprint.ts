import { createHash } from 'node:crypto';
import { normalizeText } from '../../shared/text.js';

export interface FingerprintInput {
  company: string;
  title: string;
  location?: string | undefined;
  applicationUrl?: string | undefined;
}

function normalizeUrl(value?: string): string {
  if (!value) return '';
  try {
    const url = new URL(value);
    const tracking = ['fbclid', 'gclid', 'ref', 'source'];
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith('utm_') || tracking.includes(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
    url.hash = '';
    url.searchParams.sort();
    return url.toString().replace(/\/$/, '');
  } catch {
    return normalizeText(value);
  }
}

function hash(parts: string[]): string {
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

export function createJobFingerprint(input: FingerprintInput): string {
  return hash([
    normalizeText(input.company),
    normalizeText(input.title),
    normalizeText(input.location ?? ''),
    normalizeUrl(input.applicationUrl),
  ]);
}

export function createCanonicalJobFingerprint(input: FingerprintInput): string {
  return hash([
    normalizeText(input.company).replace(/[.,]/g, ''),
    normalizeText(input.title),
    normalizeText(input.location ?? ''),
  ]);
}
