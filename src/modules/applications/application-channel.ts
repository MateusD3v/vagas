export type ApplicationPlatform =
  'LINKEDIN' | 'INDEED' | 'GREENHOUSE' | 'LEVER' | 'ASHBY' | 'WORKDAY' | 'OTHER';

export type ApplicationFlow = 'FAST_APPLY' | 'ATS' | 'MANUAL';

export interface ApplicationChannel {
  platform: ApplicationPlatform;
  flow: ApplicationFlow;
  label: string;
}

function hostname(value: string | null | undefined): string {
  if (!value) return '';
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function classifyApplicationChannel(
  applicationUrl: string | null | undefined,
  source: string,
  fastApplyHint = false,
): ApplicationChannel {
  const host = hostname(applicationUrl);
  const normalizedSource = source.toLowerCase();

  if (host.includes('linkedin.com') || normalizedSource.includes('linkedin')) {
    return {
      platform: 'LINKEDIN',
      flow: fastApplyHint ? 'FAST_APPLY' : 'MANUAL',
      label: fastApplyHint ? 'LinkedIn Easy Apply' : 'LinkedIn',
    };
  }

  if (host.includes('indeed.com') || normalizedSource.includes('indeed')) {
    return {
      platform: 'INDEED',
      flow: fastApplyHint ? 'FAST_APPLY' : 'MANUAL',
      label: fastApplyHint ? 'Indeed Apply' : 'Indeed',
    };
  }

  if (host.includes('greenhouse.io') || host.includes('greenhouse.com')) {
    return { platform: 'GREENHOUSE', flow: 'ATS', label: 'Greenhouse' };
  }
  if (host.includes('lever.co')) {
    return { platform: 'LEVER', flow: 'ATS', label: 'Lever' };
  }
  if (host.includes('ashbyhq.com')) {
    return { platform: 'ASHBY', flow: 'ATS', label: 'Ashby' };
  }
  if (host.includes('myworkdayjobs.com') || host.includes('workday.com')) {
    return { platform: 'WORKDAY', flow: 'ATS', label: 'Workday' };
  }

  return { platform: 'OTHER', flow: 'MANUAL', label: 'Externa' };
}

export function readFastApplyHint(rawData: unknown): boolean {
  if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) return false;
  return (rawData as Record<string, unknown>).fastApply === true;
}
