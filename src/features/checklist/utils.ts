import { type FeedCheck } from '@/features/plans/types';

export function buildCheckMap(checks: FeedCheck[]): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const check of checks) {
    map[`${check.date}:${check.mealIndex}`] = check.done;
  }
  return map;
}

export function completionRateByDate(checkMap: Record<string, boolean>, date: string, mealsPerDay: number): number {
  const doneCount = Array.from({ length: mealsPerDay }, (_, mealIndex) => checkMap[`${date}:${mealIndex + 1}`]).filter(
    Boolean
  ).length;

  return mealsPerDay === 0 ? 0 : doneCount / mealsPerDay;
}
