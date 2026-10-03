import type { Prisma } from '@prisma/client';

export interface SubmissionRequest {
  applicationId: string;
  source: string;
  applicationUrl: string | null;
  preparation: {
    payload: unknown;
    reusableAnswers: unknown;
  };
}

export interface SubmissionResult {
  externalApplicationId: string | null;
  submittedAt: Date;
  metadata?: Prisma.InputJsonValue;
}

export interface SubmissionProvider {
  readonly id: string;
  supports(source: string, applicationUrl: string | null): boolean;
  submit(request: SubmissionRequest): Promise<SubmissionResult>;
}
