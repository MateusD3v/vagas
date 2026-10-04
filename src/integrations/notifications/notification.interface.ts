import type { JobMatch } from '@prisma/client';

export interface NotificationMatch extends JobMatch {
  jobTitle?: string;
}

export interface NotificationProvider {
  notifyNewApply(jobMatch: NotificationMatch): Promise<void>;
  notifyReview(jobMatch: NotificationMatch): Promise<void>;
  notifySourceFailure(source: string, message: string): Promise<void>;
  notifyFollowUpsDue(applicationIds: string[]): Promise<void>;
}
