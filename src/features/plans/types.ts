export type Unit = 'g' | 'cup';
export type TransitionMode = 'percent' | 'days';

export interface PlanInput {
  petName: string;
  oldFoodName?: string;
  newFoodName?: string;
  feedingTimesPerDay: number;
  oldFoodAmountPerDay: number;
  newFoodAmountPerDay: number;
  unit: Unit;
  transitionMode: TransitionMode;
  stepPercent: number;
  switchDays: number;
  startDate: string;
  reminderTime?: string;
}

export interface Plan extends PlanInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface DailySchedule {
  dayIndex: number;
  date: string;
  oldRatio: number;
  newRatio: number;
  oldAmountPerFeeding: number;
  newAmountPerFeeding: number;
  totalOldPerDay: number;
  totalNewPerDay: number;
}

export interface FeedCheck {
  id: string;
  planId: string;
  date: string;
  mealIndex: number;
  done: boolean;
  updatedAt: string;
}

export interface ReminderSetting {
  id: string;
  planId: string;
  time: string;
  enabled: boolean;
}

export interface ReminderInput {
  time: string;
  enabled: boolean;
}
