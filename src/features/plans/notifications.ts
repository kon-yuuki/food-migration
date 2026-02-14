import { type Plan, type ReminderInput } from '@/features/plans/types';
import { formatDate, parseDate } from '@/lib/utils';

const PUSH_SUBSCRIPTION_KEY = 'food-migration:push-subscription';
const SW_READY_TIMEOUT_MS = 5000;

export interface PushSubscriptionInfo {
  endpoint: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
}

interface ReminderNotificationContent {
  title: string;
  body: string;
}

function canUseNotification(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function canUsePushNotification(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!canUseNotification()) {
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission === 'denied') {
    return false;
  }

  const result = await Notification.requestPermission();
  return result === 'granted';
}

export async function subscribePushNotification(vapidPublicKey: string): Promise<PushSubscriptionInfo> {
  if (!canUsePushNotification()) {
    throw new Error('このブラウザは Push API に未対応です。');
  }

  const hasPermission = await ensureNotificationPermission();
  if (!hasPermission) {
    throw new Error('通知が許可されていません。ブラウザ設定で通知を許可してください。');
  }

  const registration = await getPushRegistration();
  if (!registration) {
    throw new Error('Service Worker の登録に失敗しました。ページ再読み込み後に再試行してください。');
  }

  const existing = await registration.pushManager.getSubscription();
  // Always recreate subscription on enable to avoid key mismatch after VAPID key rotation.
  if (existing) {
    await existing.unsubscribe();
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: toUint8Array(vapidPublicKey) as unknown as ArrayBuffer
  });

  const result = subscription.toJSON() as PushSubscriptionInfo;
  window.localStorage.setItem(PUSH_SUBSCRIPTION_KEY, JSON.stringify(result));
  return result;
}

export async function unsubscribePushNotification(): Promise<void> {
  if (!canUsePushNotification()) {
    return;
  }

  const registration = await getPushRegistration();
  if (!registration) {
    window.localStorage.removeItem(PUSH_SUBSCRIPTION_KEY);
    return;
  }

  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    await subscription.unsubscribe();
  }
  window.localStorage.removeItem(PUSH_SUBSCRIPTION_KEY);
}

export async function isPushNotificationSubscribed(): Promise<boolean> {
  if (!canUsePushNotification()) {
    return false;
  }

  const registration = await getPushRegistration();
  if (!registration) {
    return false;
  }

  const subscription = await registration.pushManager.getSubscription();
  return subscription !== null;
}

export async function getCurrentPushSubscription(): Promise<PushSubscriptionInfo | undefined> {
  if (!canUsePushNotification()) {
    return undefined;
  }

  const registration = await getPushRegistration();
  if (!registration) {
    return undefined;
  }

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    return undefined;
  }
  return subscription.toJSON() as PushSubscriptionInfo;
}

export async function syncReminderSchedules(
  planId: string,
  reminders: ReminderInput[],
  pushApiBase?: string
): Promise<{ ok: boolean; reason?: string }> {
  const apiBase = pushApiBase?.trim();
  if (!apiBase) {
    return { ok: false, reason: 'push_api_base_missing' };
  }

  const subscription = await getCurrentPushSubscription();
  const endpoint = subscription?.endpoint;
  if (!endpoint) {
    return { ok: false, reason: 'subscription_missing' };
  }

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const payload = {
    endpoint,
    planId,
    timezone,
    reminders: reminders.map((reminder) => ({
      time: reminder.time,
      enabled: reminder.enabled
    }))
  };

  try {
    const response = await fetch(apiBase.replace(/\/$/, '') + '/api/reminders/sync', {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      return { ok: false, reason: `sync_failed:${response.status}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'sync_request_failed' };
  }
}

export function getStoredPushSubscription(): PushSubscriptionInfo | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  const raw = window.localStorage.getItem(PUSH_SUBSCRIPTION_KEY);
  if (!raw) {
    return undefined;
  }
  try {
    return JSON.parse(raw) as PushSubscriptionInfo;
  } catch {
    return undefined;
  }
}

// Web Notification API has no persistent scheduler; this triggers reminder while app is open.
export function scheduleInAppReminder(plan: Plan, time: string): number | undefined {
  if (!canUseNotification() || Notification.permission !== 'granted') {
    return undefined;
  }

  const [hour, minute] = time.split(':').map(Number);
  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);

  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }

  const timeoutMs = target.getTime() - now.getTime();
  return window.setTimeout(() => {
    const content = buildReminderNotificationContent(plan, time);
    new Notification(content.title, { body: content.body });
  }, timeoutMs);
}

function buildReminderNotificationContent(plan: Plan, time: string): ReminderNotificationContent {
  const { oldAmountPerFeeding, newAmountPerFeeding } = getDailyAmountPerFeeding(plan, formatDate(new Date()));
  const oldFoodLabel = formatFoodLabel('旧餌', plan.oldFoodName);
  const newFoodLabel = formatFoodLabel('新餌', plan.newFoodName);
  const unit = plan.unit || 'g';

  return {
    title: `給餌リマインダー(${plan.petName})`,
    body: `${time}の給餌の時間です。\n${oldFoodLabel}:${oldAmountPerFeeding}${unit}、${newFoodLabel}:${newAmountPerFeeding}${unit}`
  };
}

function formatFoodLabel(base: string, name?: string): string {
  const trimmed = name?.trim();
  return trimmed ? `${base}(${trimmed})` : base;
}

function getDailyAmountPerFeeding(plan: Plan, dateStr: string): { oldAmountPerFeeding: number; newAmountPerFeeding: number } {
  const feedingTimesPerDay = Number(plan.feedingTimesPerDay) > 0 ? Number(plan.feedingTimesPerDay) : 1;
  const oldPerFeedingBase = Number(plan.oldFoodAmountPerDay || 0) / feedingTimesPerDay;
  const newPerFeedingBase = Number(plan.newFoodAmountPerDay || 0) / feedingTimesPerDay;

  const duration = calculateDurationDaysForPlan(plan);
  const dayIndex = resolveDayIndex(plan.startDate, dateStr);
  const clampedDayIndex = clamp(dayIndex, 0, duration - 1);

  const newRatio =
    plan.transitionMode === 'days'
      ? Math.round(((clampedDayIndex + 1) / duration) * 100)
      : Math.min((clampedDayIndex + 1) * normalizeStepPercent(plan.stepPercent), 100);
  const oldRatio = 100 - newRatio;

  return {
    oldAmountPerFeeding: Math.floor(oldPerFeedingBase * (oldRatio / 100)),
    newAmountPerFeeding: Math.floor(newPerFeedingBase * (newRatio / 100))
  };
}

function calculateDurationDaysForPlan(plan: Pick<Plan, 'transitionMode' | 'switchDays' | 'stepPercent'>): number {
  if (plan.transitionMode === 'days') {
    return Math.max(1, Math.floor(Number(plan.switchDays) || 0));
  }
  return Math.ceil(100 / normalizeStepPercent(plan.stepPercent));
}

function normalizeStepPercent(stepPercent: number): number {
  const parsed = Number(stepPercent);
  return parsed > 0 ? parsed : 100;
}

function resolveDayIndex(startDate: string, targetDate: string): number {
  const start = parseDate(startDate);
  const target = parseDate(targetDate);
  const startEpochDay = Math.floor(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()) / 86400000);
  const targetEpochDay = Math.floor(Date.UTC(target.getFullYear(), target.getMonth(), target.getDate()) / 86400000);
  return targetEpochDay - startEpochDay;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

async function getPushRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!canUsePushNotification()) {
    return undefined;
  }

  const registrations = await navigator.serviceWorker.getRegistrations();
  if (registrations.length > 0) {
    return registrations[0];
  }

  // Try known SW URLs for production and VitePWA dev mode.
  const registerCandidates = ['/sw.js', '/dev-sw.js?dev-sw'];
  for (const url of registerCandidates) {
    try {
      return await navigator.serviceWorker.register(url, { type: 'module' });
    } catch {
      // try next candidate
    }
  }

  try {
    return await Promise.race<ServiceWorkerRegistration | undefined>([
      navigator.serviceWorker.ready,
      new Promise<undefined>((resolve) => {
        window.setTimeout(() => resolve(undefined), SW_READY_TIMEOUT_MS);
      })
    ]);
  } catch {
    return undefined;
  }
}

function toUint8Array(base64: string): Uint8Array {
  const normalized = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const binary = window.atob(normalized);
  const output = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    output[i] = binary.charCodeAt(i);
  }
  return output;
}
