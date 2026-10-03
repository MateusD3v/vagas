export interface AnalysisBudgetInput {
  autoAnalyze: boolean;
  runUsed: number;
  dailyUsed: number;
  maxPerRun: number;
  maxPerDay: number;
}

export function canAnalyze(input: AnalysisBudgetInput): boolean {
  return input.autoAnalyze && input.runUsed < input.maxPerRun && input.dailyUsed < input.maxPerDay;
}
