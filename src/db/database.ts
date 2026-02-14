import Dexie, { type Table } from 'dexie';
import { type FeedCheck, type Plan, type ReminderSetting } from '@/features/plans/types';

interface LegacyReminderSetting {
  id?: string;
  planId: string;
  time: string;
  enabled: boolean;
}

export class AppDatabase extends Dexie {
  plans!: Table<Plan, string>;
  feedChecks!: Table<FeedCheck, string>;
  reminders!: Table<LegacyReminderSetting, string>;
  reminderSettings!: Table<ReminderSetting, string>;

  constructor() {
    super('pet-food-change-log-db');
    this.version(1).stores({
      plans: 'id, petName, startDate, updatedAt',
      feedChecks: 'id, planId, date, mealIndex, done',
      reminders: 'planId, enabled'
    });

    this.version(2)
      .stores({
        plans: 'id, petName, startDate, updatedAt',
        feedChecks: 'id, planId, date, mealIndex, done',
        reminders: 'planId, enabled'
      });

    this.version(3)
      .stores({
        plans: 'id, petName, startDate, updatedAt',
        feedChecks: 'id, planId, date, mealIndex, done',
        reminders: 'planId, enabled',
        reminderSettings: 'id, planId, enabled, time'
      })
      .upgrade(async (tx) => {
        const legacyRows = (await tx.table('reminders').toArray()) as LegacyReminderSetting[];
        const migrated = legacyRows
          .filter((row) => Boolean(row.planId) && Boolean(row.time))
          .map((row) => ({
            id: row.id ?? `${row.planId}:${row.time}`,
            planId: row.planId,
            time: row.time,
            enabled: Boolean(row.enabled)
          }));
        if (migrated.length > 0) {
          await tx.table('reminderSettings').bulkPut(migrated);
        }
      });
  }
}

export const db = new AppDatabase();
