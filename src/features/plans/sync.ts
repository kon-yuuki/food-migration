import { type Plan } from '@/features/plans/types';

export interface SyncProvider {
  pushPlans(plans: Plan[]): Promise<void>;
  pullPlans(): Promise<Plan[]>;
}

export class NoopSyncProvider implements SyncProvider {
  async pushPlans(plans: Plan[]): Promise<void> {
    void plans;
    return;
  }

  async pullPlans(): Promise<Plan[]> {
    return [];
  }
}

export const syncProvider: SyncProvider = new NoopSyncProvider();
