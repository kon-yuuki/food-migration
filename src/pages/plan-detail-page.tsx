import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CalendarDays, ListChecks, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { buildCheckMap, completionRateByDate } from '@/features/checklist/utils';
import {
  canUsePushNotification,
  ensureNotificationPermission,
  getCurrentPushSubscription,
  isPushNotificationSubscribed,
  scheduleInAppReminder,
  syncReminderSchedules,
  subscribePushNotification,
  unsubscribePushNotification
} from '@/features/plans/notifications';
import { deletePlan, getPlanById, listChecks, listReminders, replacePlanReminders, setCheck } from '@/features/plans/repository';
import { type Plan, type ReminderInput } from '@/features/plans/types';
import { calculateSchedule, getTransitionSummary } from '@/features/schedule/calculate';
import { formatDate, parseDate } from '@/lib/utils';
import { useUserMode } from '@/features/ui/user-mode';

interface MigrationGraphItem {
  date: string;
  completion: number;
  level: 0 | 1 | 2 | 3 | 4;
  isToday: boolean;
}

export function PlanDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<Plan>();
  const [checkMap, setCheckMap] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode] = useState<'timeline' | 'calendar'>('timeline');
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [reminders, setReminders] = useState<ReminderInput[]>([]);
  const [savedReminders, setSavedReminders] = useState<ReminderInput[]>([]);
  const [editingReminderIndex, setEditingReminderIndex] = useState<number | null>(null);
  const [reminderSaving, setReminderSaving] = useState(false);
  const [reminderError, setReminderError] = useState<string>();
  const [reminderMessage, setReminderMessage] = useState<string>();
  const [reminderMessageFading, setReminderMessageFading] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushMessage, setPushMessage] = useState<string>();
  const [pushSupported, setPushSupported] = useState(false);
  const pushApiBase = (import.meta.env.VITE_PUSH_API_BASE_URL as string | undefined)?.trim();
  const { mode } = useUserMode();

  useEffect(() => {
    const refreshPushSupport = () => {
      setPushSupported(canUsePushNotification());
    };

    refreshPushSupport();
    window.addEventListener('focus', refreshPushSupport);
    document.addEventListener('visibilitychange', refreshPushSupport);
    return () => {
      window.removeEventListener('focus', refreshPushSupport);
      document.removeEventListener('visibilitychange', refreshPushSupport);
    };
  }, []);

  useEffect(() => {
    if (!id) {
      navigate('/');
      return;
    }

    void (async () => {
      const data = await getPlanById(id);
      if (!data) {
        navigate('/');
        return;
      }
      setPlan(data);
      setSelectedDate(parseDate(data.startDate));

      const checks = await listChecks(data.id);
      setCheckMap(buildCheckMap(checks));

      const storedReminders = await listReminders(data.id);
      if (storedReminders.length > 0) {
        const normalized = storedReminders.map((reminder) => ({ time: reminder.time, enabled: reminder.enabled }));
        setReminders(normalized);
        setSavedReminders(normalized);
        setEditingReminderIndex(null);
      } else if (data.reminderTime) {
        const fallback = [{ time: data.reminderTime, enabled: true }];
        setReminders(fallback);
        setSavedReminders(fallback);
        setEditingReminderIndex(null);
      } else {
        setReminders([]);
        setSavedReminders([]);
        setEditingReminderIndex(null);
      }

      setPushSubscribed(await isPushNotificationSubscribed());
    })();
  }, [id, navigate]);

  useEffect(() => {
    if (!plan) {
      return;
    }

    const timeoutIds = reminders
      .filter((reminder) => reminder.enabled)
      .map((reminder) => scheduleInAppReminder(plan, reminder.time))
      .filter((timeoutId): timeoutId is number => typeof timeoutId === 'number');

    return () => {
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, [plan, reminders]);

  useEffect(() => {
    if (!reminderMessage) {
      setReminderMessageFading(false);
      return;
    }

    setReminderMessageFading(false);
    const fadeTimer = window.setTimeout(() => {
      setReminderMessageFading(true);
    }, 9000);
    const clearTimer = window.setTimeout(() => {
      setReminderMessage(undefined);
      setReminderMessageFading(false);
    }, 10000);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(clearTimer);
    };
  }, [reminderMessage]);

  const schedule = useMemo(() => (plan ? calculateSchedule(plan) : []), [plan]);
  const oldFoodLabel = plan?.oldFoodName?.trim() || '旧エサ';
  const newFoodLabel = plan?.newFoodName?.trim() || '新エサ';
  const selectedDateStr = selectedDate ? formatDate(selectedDate) : schedule[0]?.date;
  const isEngineer = mode === 'engineer';
  const graphItems = useMemo(
    () => buildMigrationGraphItems(schedule, checkMap, plan?.feedingTimesPerDay ?? 1),
    [schedule, checkMap, plan?.feedingTimesPerDay]
  );

  if (!plan) {
    return <p className="text-sm text-muted-foreground">読み込み中...</p>;
  }

  const planStart = schedule[0]?.date;
  const planEnd = schedule[schedule.length - 1]?.date;
  const hasInvalidReminderTime = reminders.some((reminder) => !isTimeString(reminder.time));
  const hasReminderChanges = serializeReminders(reminders) !== serializeReminders(savedReminders);

  const saveReminders = async () => {
    if (hasInvalidReminderTime) {
      setReminderMessage(undefined);
      setReminderError('時刻は HH:MM 形式で入力してください。');
      return;
    }
    if (!hasReminderChanges) {
      setReminderError(undefined);
      return;
    }
    if (reminders.some((reminder) => reminder.enabled)) {
      await ensureNotificationPermission();
    }

    setReminderSaving(true);
    setReminderMessage(undefined);
    setReminderError(undefined);
    try {
      await replacePlanReminders(plan.id, reminders);
      const syncResult = await syncReminderSchedules(plan.id, reminders, pushApiBase);
      setSavedReminders(reminders.map((reminder) => ({ ...reminder })));
      setEditingReminderIndex(null);
      if (syncResult.ok) {
        setReminderMessage('リマインダーを保存しました。');
      } else if (syncResult.reason === 'subscription_missing') {
        setReminderMessage('リマインダーを保存しました（Push通知はこの端末の通知ON後に有効化されます）。');
      } else if (syncResult.reason === 'push_api_base_missing') {
        setReminderMessage('リマインダーを保存しました（Push配信先が未設定）。');
      } else {
        setReminderMessage('リマインダーを保存しました（Push同期に失敗）。');
      }
    } catch {
      setReminderMessage(undefined);
      setReminderError('リマインダーの保存に失敗しました。');
    } finally {
      setReminderSaving(false);
    }
  };

  const togglePush = async (enabled: boolean) => {
    const publicKey = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY as string | undefined;
    if (!enabled) {
      setPushLoading(true);
      setPushMessage(undefined);
      try {
        const current = await getCurrentPushSubscription();
        await unsubscribePushNotification();
        if (pushApiBase && current?.endpoint) {
          await deleteSubscriptionFromWorker(pushApiBase, current.endpoint);
        }
        setPushSubscribed(false);
        setPushMessage('この端末の通知を停止しました。');
      } catch {
        setPushMessage('通知の停止に失敗しました。');
      } finally {
        setPushLoading(false);
      }
      return;
    }

    if (!publicKey) {
      setPushMessage('通知設定が未完了です（公開鍵が未設定）。');
      return;
    }

    setPushLoading(true);
    setPushMessage(undefined);
    try {
      const subscription = await subscribePushNotification(publicKey);
      if (!subscription) {
        setPushMessage('通知を有効化できませんでした。ブラウザ通知の許可を確認してください。');
        return;
      }

      setPushSubscribed(true);
      if (pushApiBase) {
        const saved = await saveSubscriptionToWorker(pushApiBase, subscription);
        if (!saved) {
          setPushMessage('通知は有効化しましたが、サーバー登録に失敗しました。');
          return;
        }
        const syncResult = await syncReminderSchedules(plan.id, reminders, pushApiBase);
        if (syncResult.ok) {
          setPushMessage('この端末で通知を受け取る設定を保存しました。');
        } else {
          setPushMessage('通知は有効化しましたが、リマインダー同期に失敗しました。');
        }
      } else {
        setPushMessage('この端末で通知を有効化しました。');
      }
    } catch {
      setPushMessage('通知設定の切替に失敗しました。');
    } finally {
      setPushLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="sr-only">{plan.petName} のプラン詳細</h1>
      <Card className="dev-surface">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
            <div>
              <CardTitle>{plan.petName}</CardTitle>
              <CardDescription>
                {plan.feedingTimesPerDay}回/日・{getTransitionSummary(plan)}・{plan.unit}
              </CardDescription>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Button className="w-full sm:w-auto" variant="outline" asChild>
                <Link to={`/plans/${plan.id}/edit`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  編集
                </Link>
              </Button>
              <Dialog>
                <DialogTrigger asChild>
                  <Button className="w-full sm:w-auto" variant="ghost">
                    <Trash2 className="mr-2 h-4 w-4" />
                    削除
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>このプランを削除しますか？</DialogTitle>
                    <DialogDescription>チェック履歴も削除されます。</DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline">キャンセル</Button>
                    </DialogClose>
                    <Button
                      onClick={async () => {
                        await deletePlan(plan.id);
                        navigate('/');
                      }}
                    >
                      削除する
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card className="dev-surface">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">リマインダー</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setReminderMessage(undefined);
                setReminderError(undefined);
                const newIndex = reminders.length;
                setReminders((prev) => [...prev, { time: '08:00', enabled: true }]);
                setEditingReminderIndex(newIndex);
              }}
            >
              <Plus className="mr-1 h-4 w-4" />
              追加
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {reminders.length === 0 && <p className="text-sm text-muted-foreground">未設定（通知なし）</p>}
          {reminders.map((reminder, index) => (
            <div key={index} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
              {editingReminderIndex === index ? (
                <Input
                  type="time"
                  className="h-11 min-w-0 flex-1"
                  value={reminder.time}
                  onChange={(event) => {
                    setReminderMessage(undefined);
                    setReminderError(undefined);
                    setReminders((prev) => prev.map((item, itemIndex) => (itemIndex === index ? { ...item, time: event.target.value } : item)));
                  }}
                  />
              ) : (
                <div className="h-11 min-w-0 flex-1 px-1 py-2 text-sm">
                  <span className="font-medium">{reminder.time}</span>
                </div>
              )}
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{reminder.enabled ? 'ON' : 'OFF'}</span>
                <Switch
                  checked={reminder.enabled}
                  onCheckedChange={(checked) => {
                    setReminderMessage(undefined);
                    setReminderError(undefined);
                    setReminders((prev) => prev.map((item, itemIndex) => (itemIndex === index ? { ...item, enabled: checked } : item)));
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setReminderMessage(undefined);
                    setReminderError(undefined);
                    setEditingReminderIndex(index);
                  }}
                >
                  変更
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setReminderMessage(undefined);
                    setReminderError(undefined);
                    setReminders((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
                    setEditingReminderIndex((prev) => (prev === null ? null : prev > index ? prev - 1 : prev === index ? null : prev));
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          {reminderMessage && <p className={`text-xs text-emerald-600 transition-opacity duration-1000 ${reminderMessageFading ? 'opacity-0' : 'opacity-100'}`}>{reminderMessage}</p>}
          {reminderError && <p className="text-xs text-red-600">{reminderError}</p>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setReminderMessage(undefined);
                setReminderError(undefined);
                setReminders(savedReminders.map((reminder) => ({ ...reminder })));
                setEditingReminderIndex(null);
              }}
            >
              キャンセル
            </Button>
            <Button type="button" onClick={saveReminders} disabled={reminderSaving || hasInvalidReminderTime || !hasReminderChanges}>
              {reminderSaving ? '保存中...' : 'リマインダーを保存'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="dev-surface">
        <CardHeader>
          <CardTitle className="text-base">通知を受け取る設定</CardTitle>
          <CardDescription>この端末で Push 通知を受け取るかどうかを切り替えます。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!pushSupported && <p className="text-sm text-muted-foreground">この環境では Push 通知が未対応です（ホーム画面アプリ起動/通知許可を確認）。</p>}
          {pushSupported && (
            <label className="flex items-center gap-3 rounded-md border p-3">
              <Switch checked={pushSubscribed} disabled={pushLoading} onCheckedChange={(checked) => void togglePush(checked)} />
              <span className="text-sm">この端末で通知を受け取る</span>
              <span className="ml-auto text-xs text-muted-foreground">{pushLoading ? '更新中...' : pushSubscribed ? 'ON' : 'OFF'}</span>
            </label>
          )}
          <p className="text-xs text-muted-foreground">ON: アプリを閉じていても Push 通知を受信 / OFF: アプリ起動中のみ通知を表示</p>
          <p className="text-xs text-muted-foreground">
            受信条件の詳細は <Link className="underline underline-offset-2" to="/about">About</Link> を確認してください（iPhone/iPad は Safari でホーム画面追加が必要）。
          </p>
          {pushMessage && <p className="text-xs text-muted-foreground">{pushMessage}</p>}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <Button className={`w-full ${isEngineer ? 'metric uppercase tracking-wide' : ''}`} variant={viewMode === 'timeline' ? 'default' : 'outline'} onClick={() => setViewMode('timeline')}>
          <ListChecks className="mr-2 h-4 w-4" />
          タイムライン
        </Button>
        <Button className={`w-full ${isEngineer ? 'metric uppercase tracking-wide' : ''}`} variant={viewMode === 'calendar' ? 'default' : 'outline'} onClick={() => setViewMode('calendar')}>
          <CalendarDays className="mr-2 h-4 w-4" />
          {mode === 'engineer' ? 'Migration Graph' : '進捗カレンダー'}
        </Button>
      </div>

      {viewMode === 'calendar' && (
        <Card className={isEngineer ? 'dev-surface border-dashed border-border/90' : 'dev-surface'}>
          <CardContent className="space-y-3 pt-6">
            <div className={`grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 ${isEngineer ? 'metric' : ''}`}>
              <p className={isEngineer ? 'rounded-md border border-border/70 bg-muted/20 px-2 py-1.5' : ''}>
                {mode === 'engineer' ? 'selected:' : '選択日:'} <span className="metric text-foreground">{selectedDateStr ? formatDateWithWeekday(selectedDateStr) : '-'}</span>
              </p>
              <p className={isEngineer ? 'rounded-md border border-border/70 bg-muted/20 px-2 py-1.5' : ''}>
                {mode === 'engineer' ? 'range:' : '期間:'} <span className="metric text-foreground">{planStart ?? '-'} ~ {planEnd ?? '-'}</span>
              </p>
            </div>

            <div className={`flex items-center gap-2 text-xs text-muted-foreground ${isEngineer ? 'metric tracking-wide' : ''}`}>
              <span className="h-3 w-3 rounded-[3px] border border-border bg-muted/50" />{isEngineer ? '0' : '0%'}
              <span className="h-3 w-3 rounded-[3px] border border-primary/30 bg-primary/20" />{isEngineer ? '1-49' : '1-49%'}
              <span className="h-3 w-3 rounded-[3px] border border-primary/50 bg-primary/45" />{isEngineer ? '50-99' : '50-99%'}
              <span className="h-3 w-3 rounded-[3px] border border-primary bg-primary" />{isEngineer ? '100' : '100%'}
            </div>

            <div className="overflow-x-auto">
              <div className="inline-flex gap-2 pb-1">
                {graphItems.map((item) => (
                  <button
                    key={item.date}
                    type="button"
                    onClick={() => setSelectedDate(parseDate(item.date))}
                    title={`${formatDateWithWeekday(item.date)} 達成 ${Math.round(item.completion * 100)}%`}
                    className={`flex min-w-[64px] flex-col items-center gap-1 rounded-md border px-2 py-2 text-[10px] ${
                      isEngineer ? 'metric border-border/80 bg-muted/30 hover:border-border dark:bg-[#161b22]' : 'border-border/70 bg-muted/20'
                    }`}
                  >
                    <span className="text-muted-foreground">{isEngineer ? item.date.slice(5) : formatDateShort(item.date)}</span>
                    <span className="text-muted-foreground">{formatWeekdayShort(item.date)}</span>
                    <span className="relative inline-flex h-5 w-5 items-center justify-center">
                      <span className={buildGraphCellClass(item, selectedDateStr)} />
                      {item.level === 4 && <img src="/icons/bone.svg" alt="" aria-hidden="true" className="pointer-events-none absolute h-4 w-4" />}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {schedule
          .filter((day) => (viewMode === 'timeline' ? true : day.date === selectedDateStr))
          .map((day) => {
            const completion = completionRateByDate(checkMap, day.date, plan.feedingTimesPerDay);

            return (
              <Card key={day.date} className="dev-surface">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">{day.date}</CardTitle>
                      <CardDescription>
                        <span className="old-food">{oldFoodLabel} {day.oldRatio}%</span> / <span className="new-food">{newFoodLabel} {day.newRatio}%</span>
                      </CardDescription>
                    </div>
                    <Badge variant="secondary">{Math.round(completion * 100)}%</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p>
                    1回量: <span className="old-food">{oldFoodLabel} {day.oldAmountPerFeeding}{plan.unit}</span> / <span className="new-food">{newFoodLabel} {day.newAmountPerFeeding}{plan.unit}</span>
                  </p>
                  <p>
                    1日量: <span className="old-food">{oldFoodLabel} {day.totalOldPerDay}{plan.unit}</span> / <span className="new-food">{newFoodLabel} {day.totalNewPerDay}{plan.unit}</span>
                  </p>

                  <div className="grid gap-2 md:grid-cols-2">
                    {Array.from({ length: plan.feedingTimesPerDay }, (_, i) => i + 1).map((mealIndex) => {
                      const key = `${day.date}:${mealIndex}`;
                      const checked = Boolean(checkMap[key]);
                      return (
                        <label key={key} className="flex items-center gap-2 rounded-md border p-2">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={async (value) => {
                              const next = Boolean(value);
                              setCheckMap((prev) => ({ ...prev, [key]: next }));
                              await setCheck(plan.id, day.date, mealIndex, next);
                            }}
                          />
                          <span>{mealIndex}回目を給餌済みにする</span>
                        </label>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
      </div>
    </div>
  );
}

function serializeReminders(reminders: ReminderInput[]): string {
  return reminders.map((reminder) => `${reminder.time}:${reminder.enabled ? '1' : '0'}`).join('|');
}

function isTimeString(value: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

function formatDateWithWeekday(dateStr: string): string {
  const date = parseDate(dateStr);
  const weekday = new Intl.DateTimeFormat('ja-JP', { weekday: 'short' }).format(date);
  return `${dateStr} (${weekday})`;
}

function formatDateShort(dateStr: string): string {
  const date = parseDate(dateStr);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}/${day}`;
}

function formatWeekdayShort(dateStr: string): string {
  const date = parseDate(dateStr);
  return new Intl.DateTimeFormat('ja-JP', { weekday: 'short' }).format(date);
}

function buildMigrationGraphItems(
  schedule: ReturnType<typeof calculateSchedule>,
  checkMap: Record<string, boolean>,
  feedingTimesPerDay: number
): MigrationGraphItem[] {
  const todayStr = formatDate(new Date());
  return schedule.map((day) => {
    const completion = completionRateByDate(checkMap, day.date, feedingTimesPerDay);
    return {
      date: day.date,
      completion,
      level: completionToLevel(completion),
      isToday: day.date === todayStr
    };
  });
}

function completionToLevel(value: number): 0 | 1 | 2 | 3 | 4 {
  if (value >= 1) {
    return 4;
  }
  if (value >= 0.75) {
    return 3;
  }
  if (value >= 0.5) {
    return 2;
  }
  if (value > 0) {
    return 1;
  }
  return 0;
}

function buildGraphCellClass(item: MigrationGraphItem, selectedDate?: string): string {
  const tone =
    item.level === 0
      ? 'border-border bg-muted/50'
      : item.level === 1
        ? 'border-primary/30 bg-primary/20'
        : item.level === 2
          ? 'border-primary/50 bg-primary/45'
          : item.level === 3
            ? 'border-primary/70 bg-primary/70'
            : 'border-primary bg-primary';

  const selected = item.date === selectedDate ? 'ring-2 ring-foreground/80 ring-offset-1 ring-offset-background' : '';
  const today = item.isToday ? 'outline outline-1 outline-offset-0 outline-amber-400' : '';
  return `h-5 w-5 rounded-[4px] border ${tone} ${selected} ${today}`.trim();
}

async function saveSubscriptionToWorker(pushApiBase: string, subscription: { endpoint: string; keys?: { p256dh?: string; auth?: string } }): Promise<boolean> {
  try {
    const endpoint = pushApiBase.replace(/\/$/, '') + '/api/subscriptions';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({ subscription })
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function deleteSubscriptionFromWorker(pushApiBase: string, endpointValue: string): Promise<boolean> {
  try {
    const endpoint = pushApiBase.replace(/\/$/, '') + '/api/subscriptions';
    const response = await fetch(endpoint, {
      method: 'DELETE',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({ endpoint: endpointValue })
    });
    return response.ok;
  } catch {
    return false;
  }
}
