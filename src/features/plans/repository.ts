import { db } from '@/db/database';
import { type FeedCheck, type Plan, type PlanInput, type ReminderInput, type ReminderSetting } from '@/features/plans/types';

function uuid() {
  return crypto.randomUUID();
}

function normalizePlan(raw: Plan): Plan {
  const oldLegacy = (raw as unknown as { oldFoodAmountPerMeal?: number }).oldFoodAmountPerMeal;
  const newLegacy = (raw as unknown as { newFoodAmountPerMeal?: number }).newFoodAmountPerMeal;
  const stepPercent = Number.isFinite(raw.stepPercent) && raw.stepPercent > 0 ? raw.stepPercent : 25;
  const transitionMode = raw.transitionMode === 'days' ? 'days' : 'percent';
  const switchDays = Number.isFinite(raw.switchDays) && raw.switchDays > 0 ? Math.floor(raw.switchDays) : Math.ceil(100 / stepPercent);

  return {
    ...raw,
    oldFoodName: raw.oldFoodName ?? '',
    newFoodName: raw.newFoodName ?? '',
    transitionMode,
    stepPercent,
    switchDays,
    oldFoodAmountPerDay: raw.oldFoodAmountPerDay ?? (oldLegacy ?? 0) * raw.feedingTimesPerDay,
    newFoodAmountPerDay: raw.newFoodAmountPerDay ?? (newLegacy ?? 0) * raw.feedingTimesPerDay
  };
}

export async function listPlans(): Promise<Plan[]> {
  const plans = await db.plans.orderBy('updatedAt').reverse().toArray();
  return plans.map(normalizePlan);
}

export async function getPlanById(id: string): Promise<Plan | undefined> {
  const plan = await db.plans.get(id);
  return plan ? normalizePlan(plan) : undefined;
}

export async function createPlan(input: PlanInput): Promise<Plan> {
  const now = new Date().toISOString();
  const plan: Plan = { ...input, id: uuid(), createdAt: now, updatedAt: now };
  await db.plans.add(plan);
  const reminders = buildReminderPayload(plan.id, [], input.reminderTime);
  if (reminders.length > 0) {
    await db.reminderSettings.bulkPut(reminders);
  }

  return plan;
}

export async function createPlanWithReminders(input: PlanInput, reminders: ReminderInput[]): Promise<Plan> {
  const now = new Date().toISOString();
  const plan: Plan = { ...input, id: uuid(), createdAt: now, updatedAt: now };
  await db.plans.add(plan);
  await replaceReminders(plan.id, reminders, input.reminderTime);
  return plan;
}

export async function updatePlan(id: string, input: PlanInput): Promise<Plan> {
  const prev = await db.plans.get(id);
  if (!prev) {
    throw new Error('Plan not found');
  }

  const next: Plan = {
    ...prev,
    ...input,
    id,
    updatedAt: new Date().toISOString()
  };

  await db.plans.put(next);
  await replaceReminders(id, [], input.reminderTime);

  return next;
}

export async function updatePlanWithReminders(id: string, input: PlanInput, reminders: ReminderInput[]): Promise<Plan> {
  const prev = await db.plans.get(id);
  if (!prev) {
    throw new Error('Plan not found');
  }

  const next: Plan = {
    ...prev,
    ...input,
    id,
    updatedAt: new Date().toISOString()
  };

  await db.plans.put(next);
  await replaceReminders(id, reminders, input.reminderTime);
  return next;
}

export async function deletePlan(id: string): Promise<void> {
  await db.transaction('rw', db.plans, db.feedChecks, db.reminderSettings, db.reminders, async () => {
    await db.plans.delete(id);
    const checkIds = (await db.feedChecks.where('planId').equals(id).toArray()).map((x) => x.id);
    if (checkIds.length > 0) {
      await db.feedChecks.bulkDelete(checkIds);
    }
    const reminderIds = (await db.reminderSettings.where('planId').equals(id).toArray()).map((x) => x.id);
    if (reminderIds.length > 0) {
      await db.reminderSettings.bulkDelete(reminderIds);
    }
    const legacyReminderIds = (await db.reminders.where('planId').equals(id).toArray()).map((x) => x.planId);
    if (legacyReminderIds.length > 0) {
      await db.reminders.bulkDelete(legacyReminderIds);
    }
  });
}

export async function listChecks(planId: string): Promise<FeedCheck[]> {
  return db.feedChecks.where('planId').equals(planId).toArray();
}

export async function setCheck(planId: string, date: string, mealIndex: number, done: boolean): Promise<void> {
  const id = `${planId}:${date}:${mealIndex}`;
  const payload: FeedCheck = {
    id,
    planId,
    date,
    mealIndex,
    done,
    updatedAt: new Date().toISOString()
  };
  await db.feedChecks.put(payload);
}

export async function getReminder(planId: string): Promise<ReminderSetting | undefined> {
  return db.reminderSettings.where('planId').equals(planId).first();
}

export async function setReminder(planId: string, time: string, enabled: boolean): Promise<void> {
  await db.reminderSettings.put({ id: uuid(), planId, time, enabled });
}

export async function listReminders(planId: string): Promise<ReminderSetting[]> {
  return db.reminderSettings.where('planId').equals(planId).sortBy('time');
}

export async function replacePlanReminders(planId: string, reminders: ReminderInput[]): Promise<void> {
  await replaceReminders(planId, reminders);
}

async function replaceReminders(planId: string, reminders: ReminderInput[], fallbackTime?: string): Promise<void> {
  const next = buildReminderPayload(planId, reminders, fallbackTime);
  await db.transaction('rw', db.reminderSettings, async () => {
    const existingIds = (await db.reminderSettings.where('planId').equals(planId).toArray()).map((x) => x.id);
    if (existingIds.length > 0) {
      await db.reminderSettings.bulkDelete(existingIds);
    }
    if (next.length > 0) {
      await db.reminderSettings.bulkAdd(next);
    }
  });
}

function buildReminderPayload(planId: string, reminders: ReminderInput[], fallbackTime?: string): ReminderSetting[] {
  if (reminders.length > 0) {
    return reminders.map((reminder) => ({
      id: uuid(),
      planId,
      time: reminder.time,
      enabled: reminder.enabled
    }));
  }

  if (fallbackTime) {
    return [{ id: uuid(), planId, time: fallbackTime, enabled: true }];
  }

  return [];
}
