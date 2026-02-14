import { describe, expect, it } from 'vitest';
import { calculateDurationDays, calculateSchedule } from '@/features/schedule/calculate';
import { type PlanInput } from '@/features/plans/types';

const basePlan: PlanInput = {
  petName: 'Mugi',
  oldFoodName: '',
  newFoodName: '',
  feedingTimesPerDay: 2,
  oldFoodAmountPerDay: 80,
  newFoodAmountPerDay: 80,
  unit: 'g',
  transitionMode: 'percent',
  stepPercent: 25,
  switchDays: 4,
  startDate: '2026-02-12'
};

describe('calculateDurationDays', () => {
  it('returns expected durations', () => {
    expect(calculateDurationDays({ transitionMode: 'percent', stepPercent: 10, switchDays: 10 })).toBe(10);
    expect(calculateDurationDays({ transitionMode: 'percent', stepPercent: 20, switchDays: 5 })).toBe(5);
    expect(calculateDurationDays({ transitionMode: 'percent', stepPercent: 25, switchDays: 4 })).toBe(4);
    expect(calculateDurationDays({ transitionMode: 'percent', stepPercent: 33, switchDays: 4 })).toBe(4);
    expect(calculateDurationDays({ transitionMode: 'days', stepPercent: 25, switchDays: 7 })).toBe(7);
  });
});

describe('calculateSchedule', () => {
  it('caps new ratio at 100%', () => {
    const schedule = calculateSchedule({ ...basePlan, stepPercent: 33 });
    expect(schedule.at(-1)?.newRatio).toBe(100);
    expect(schedule.at(-1)?.oldRatio).toBe(0);
  });

  it('starts transition from the start date and has 50/50 on day 2 for 25%', () => {
    const schedule = calculateSchedule(basePlan);
    expect(schedule[0]).toMatchObject({
      oldRatio: 75,
      newRatio: 25
    });
    expect(schedule[1]).toMatchObject({
      oldRatio: 50,
      newRatio: 50,
      oldAmountPerFeeding: 20,
      newAmountPerFeeding: 20
    });
  });

  it('supports day-based transition mode', () => {
    const schedule = calculateSchedule({ ...basePlan, transitionMode: 'days', switchDays: 5 });
    expect(schedule).toHaveLength(5);
    expect(schedule[0]).toMatchObject({
      oldRatio: 80,
      newRatio: 20
    });
    expect(schedule.at(-1)).toMatchObject({
      oldRatio: 0,
      newRatio: 100
    });
  });
});
