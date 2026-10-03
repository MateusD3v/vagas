export const MATCHING_WEIGHTS = Object.freeze({
  skills: 35,
  experience: 20,
  role: 15,
  location: 10,
  seniority: 10,
  education: 5,
  salary: 5,
});

export const SCORE_MIN = 0;
export const SCORE_MAX = 100;

export function clampScore(value: number): number {
  return Math.max(SCORE_MIN, Math.min(SCORE_MAX, Math.round(value)));
}
