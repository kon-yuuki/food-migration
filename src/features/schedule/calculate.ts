import { addDays, floorAmount, formatDate, parseDate } from '@/lib/utils';
import { type DailySchedule, type PlanInput } from '@/features/plans/types';

export function calculateDurationDays(plan: Pick<PlanInput, 'transitionMode' | 'stepPercent' | 'switchDays'>): number {
  if (plan.transitionMode === 'days') {
    return Math.max(1, Math.floor(plan.switchDays));
  }
  return Math.ceil(100 / plan.stepPercent);
}

export function getTransitionSummary(plan: Pick<PlanInput, 'transitionMode' | 'stepPercent' | 'switchDays'>): string {
  return plan.transitionMode === 'days' ? `${plan.switchDays}日で切り替え` : `${plan.stepPercent}%ステップ`;
}

export function calculateSchedule(plan: PlanInput): DailySchedule[] {
  const duration = calculateDurationDays(plan);
  const startDate = parseDate(plan.startDate);
  const oldPerFeedingBase = plan.oldFoodAmountPerDay / plan.feedingTimesPerDay;
  const newPerFeedingBase = plan.newFoodAmountPerDay / plan.feedingTimesPerDay;

  return Array.from({ length: duration }, (_, dayIndex) => {
    const newRatio =
      plan.transitionMode === 'days'
        ? Math.round(((dayIndex + 1) / duration) * 100)
        : Math.min((dayIndex + 1) * plan.stepPercent, 100);
    const oldRatio = 100 - newRatio;

    const oldAmountPerFeeding = floorAmount(oldPerFeedingBase * (oldRatio / 100));
    const newAmountPerFeeding = floorAmount(newPerFeedingBase * (newRatio / 100));

    return {
      dayIndex,
      date: formatDate(addDays(startDate, dayIndex)),
      oldRatio,
      newRatio,
      oldAmountPerFeeding,
      newAmountPerFeeding,
      totalOldPerDay: floorAmount(oldAmountPerFeeding * plan.feedingTimesPerDay),
      totalNewPerDay: floorAmount(newAmountPerFeeding * plan.feedingTimesPerDay)
    };
  });
}
