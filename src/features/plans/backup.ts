import { db } from '@/db/database';
import { type FeedCheck, type Plan, type ReminderSetting } from '@/features/plans/types';

export interface AppBackupData {
  version: 1;
  exportedAt: string;
  plans: Plan[];
  feedChecks: FeedCheck[];
  reminderSettings: ReminderSetting[];
}

export async function createBackupData(): Promise<AppBackupData> {
  const [plans, feedChecks, reminderSettings] = await Promise.all([
    db.plans.toArray(),
    db.feedChecks.toArray(),
    db.reminderSettings.toArray()
  ]);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    plans,
    feedChecks,
    reminderSettings
  };
}

export async function restoreBackupData(raw: string, mode: 'merge' | 'replace' = 'merge'): Promise<void> {
  const parsed = JSON.parse(raw) as Partial<AppBackupData>;

  if (parsed.version !== 1) {
    throw new Error('バックアップ形式が不正です（version）。');
  }

  const plans = Array.isArray(parsed.plans) ? parsed.plans : [];
  const feedChecks = Array.isArray(parsed.feedChecks) ? parsed.feedChecks : [];
  const reminderSettings = Array.isArray(parsed.reminderSettings) ? parsed.reminderSettings : [];

  if (mode === 'replace') {
    await db.transaction('rw', db.plans, db.feedChecks, db.reminderSettings, async () => {
      await db.plans.clear();
      await db.feedChecks.clear();
      await db.reminderSettings.clear();

      if (plans.length > 0) {
        await db.plans.bulkPut(plans);
      }
      if (feedChecks.length > 0) {
        await db.feedChecks.bulkPut(feedChecks);
      }
      if (reminderSettings.length > 0) {
        await db.reminderSettings.bulkPut(reminderSettings);
      }
    });

    return;
  }

  await db.transaction('rw', db.plans, db.feedChecks, db.reminderSettings, async () => {
    if (plans.length > 0) {
      await db.plans.bulkPut(plans);
    }
    if (feedChecks.length > 0) {
      await db.feedChecks.bulkPut(feedChecks);
    }
    if (reminderSettings.length > 0) {
      await db.reminderSettings.bulkPut(reminderSettings);
    }
  });
}
