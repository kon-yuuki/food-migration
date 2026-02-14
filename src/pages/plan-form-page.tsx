import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { z } from 'zod';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { createPlanWithReminders, getPlanById, listReminders, updatePlanWithReminders } from '@/features/plans/repository';
import {
  canUsePushNotification,
  ensureNotificationPermission,
  getCurrentPushSubscription,
  isPushNotificationSubscribed,
  syncReminderSchedules,
  subscribePushNotification,
  unsubscribePushNotification
} from '@/features/plans/notifications';
import { floorAmount, formatDate } from '@/lib/utils';

const planSchema = z.object({
  petName: z.string().min(1, 'ペット名は必須です'),
  oldFoodName: z.string().optional(),
  newFoodName: z.string().optional(),
  feedingTimesPerDay: z.coerce.number().int().min(1).max(12),
  oldFoodAmountPerDay: z.coerce.number().positive(),
  newFoodAmountPerDay: z.coerce.number().positive(),
  unit: z.enum(['g', 'cup']),
  transitionMode: z.enum(['percent', 'days']),
  stepPercent: z.coerce.number().int().min(1).max(100),
  switchDays: z.coerce.number().int().min(1).max(365),
  startDate: z.string().min(1),
  reminders: z.array(
    z.object({
      time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, '時刻は HH:MM 形式で入力してください'),
      enabled: z.boolean()
    })
  )
});

type PlanFormValues = z.infer<typeof planSchema>;

const defaultValues: PlanFormValues = {
  petName: '',
  oldFoodName: '',
  newFoodName: '',
  feedingTimesPerDay: 2,
  oldFoodAmountPerDay: 100,
  newFoodAmountPerDay: 100,
  unit: 'g',
  transitionMode: 'percent',
  stepPercent: 25,
  switchDays: 4,
  startDate: formatDate(new Date()),
  reminders: []
};

export function PlanFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(mode === 'edit');
  const [pushSupported, setPushSupported] = useState(() => canUsePushNotification());
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushMessage, setPushMessage] = useState<string>();
  const pushApiBase = (import.meta.env.VITE_PUSH_API_BASE_URL as string | undefined)?.trim();

  const form = useForm<PlanFormValues>({
    resolver: zodResolver(planSchema),
    defaultValues
  });
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'reminders'
  });

  useEffect(() => {
    const refreshPush = async () => {
      setPushSupported(canUsePushNotification());
      setPushSubscribed(await isPushNotificationSubscribed());
    };
    void refreshPush();
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (mode !== 'edit' || !id) {
      form.reset({
        ...defaultValues,
        startDate: formatDate(new Date())
      });
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    void (async () => {
      const plan = await getPlanById(id);
      if (!plan) {
        navigate('/');
        return;
      }
      if (cancelled) {
        return;
      }

      form.reset({
        petName: plan.petName,
        oldFoodName: plan.oldFoodName ?? '',
        newFoodName: plan.newFoodName ?? '',
        feedingTimesPerDay: plan.feedingTimesPerDay,
        oldFoodAmountPerDay: plan.oldFoodAmountPerDay,
        newFoodAmountPerDay: plan.newFoodAmountPerDay,
        unit: plan.unit,
        transitionMode: plan.transitionMode,
        stepPercent: plan.stepPercent,
        switchDays: plan.switchDays,
        startDate: plan.startDate,
        reminders: []
      });
      const reminders = await listReminders(plan.id);
      if (cancelled) {
        return;
      }
      const normalizedReminders =
        reminders.length > 0
          ? reminders.map((reminder) => ({ time: reminder.time, enabled: reminder.enabled }))
          : plan.reminderTime
            ? [{ time: plan.reminderTime, enabled: true }]
            : [];
      form.setValue('reminders', normalizedReminders);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [form, id, mode, navigate]);

  const title = useMemo(() => (mode === 'create' ? 'プラン作成' : 'プラン編集'), [mode]);
  const feedingTimesPerDay = form.watch('feedingTimesPerDay');
  const oldFoodAmountPerDay = form.watch('oldFoodAmountPerDay');
  const newFoodAmountPerDay = form.watch('newFoodAmountPerDay');
  const oldFoodName = form.watch('oldFoodName');
  const newFoodName = form.watch('newFoodName');
  const unit = form.watch('unit');
  const transitionMode = form.watch('transitionMode');
  const canSubmit = form.formState.isDirty && !form.formState.isSubmitting;

  const preview = useMemo(() => {
    const times = Number(feedingTimesPerDay);
    const oldPerDay = Number(oldFoodAmountPerDay);
    const newPerDay = Number(newFoodAmountPerDay);

    if (!Number.isFinite(times) || times <= 0) {
      return null;
    }
    if (!Number.isFinite(oldPerDay) || !Number.isFinite(newPerDay)) {
      return null;
    }

    return {
      oldPerFeeding: floorAmount(oldPerDay / times),
      newPerFeeding: floorAmount(newPerDay / times)
    };
  }, [feedingTimesPerDay, oldFoodAmountPerDay, newFoodAmountPerDay]);

  const oldFoodLabel = oldFoodName?.trim() ? `旧餌（${oldFoodName.trim()}）` : '旧餌';
  const newFoodLabel = newFoodName?.trim() ? `新餌（${newFoodName.trim()}）` : '新餌';

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
        if (mode === 'edit' && id) {
          const syncResult = await syncReminderSchedules(id, form.getValues('reminders'), pushApiBase);
          if (syncResult.ok) {
            setPushMessage('この端末で通知を受け取る設定を保存しました。');
          } else {
            setPushMessage('通知は有効化しましたが、リマインダー同期に失敗しました。');
          }
        } else {
          setPushMessage('この端末で通知を受け取る設定を保存しました。');
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

  if (loading) {
    return <p className="text-sm text-muted-foreground">読み込み中...</p>;
  }

  return (
    <Card className="dev-surface">
      <CardHeader>
        <h1 className="sr-only">{title}</h1>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={form.handleSubmit(async (values) => {
            if (values.reminders.some((reminder) => reminder.enabled)) {
              await ensureNotificationPermission();
            }

            const { reminders, ...planInput } = values;

            if (mode === 'create') {
              const created = await createPlanWithReminders(planInput, reminders);
              const syncResult = await syncReminderSchedules(created.id, reminders, pushApiBase);
              if (!syncResult.ok && syncResult.reason && syncResult.reason !== 'subscription_missing') {
                setPushMessage('プランは保存しましたが、Push同期に失敗しました。');
              }
              navigate('/');
              return;
            }

            if (!id) {
              return;
            }

            await updatePlanWithReminders(id, planInput, reminders);
            const syncResult = await syncReminderSchedules(id, reminders, pushApiBase);
            if (!syncResult.ok && syncResult.reason && syncResult.reason !== 'subscription_missing') {
              setPushMessage('プランは保存しましたが、Push同期に失敗しました。');
            }
            navigate('/');
          })}
        >
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="petName">ペット名</Label>
            <Input id="petName" {...form.register('petName')} />
            <FieldError message={form.formState.errors.petName?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="oldFoodName">旧エサ名（任意）</Label>
            <Input id="oldFoodName" placeholder="例: これまでのフード" {...form.register('oldFoodName')} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="newFoodName">新エサ名（任意）</Label>
            <Input id="newFoodName" placeholder="例: 療法食A" {...form.register('newFoodName')} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedingTimesPerDay">1日の給餌回数</Label>
            <Input id="feedingTimesPerDay" type="number" min={1} max={12} {...form.register('feedingTimesPerDay')} />
            <FieldError message={form.formState.errors.feedingTimesPerDay?.message} />
          </div>

          <div className="space-y-2">
            <Label>切り替え設定</Label>
            <Select
              value={form.watch('transitionMode')}
              onValueChange={(value: 'percent' | 'days') => {
                form.setValue('transitionMode', value);
                if (value === 'days') {
                  const step = Number(form.getValues('stepPercent'));
                  if (Number.isFinite(step) && step > 0) {
                    form.setValue('switchDays', Math.ceil(100 / step));
                  }
                  return;
                }
                const days = Number(form.getValues('switchDays'));
                if (Number.isFinite(days) && days > 0) {
                  form.setValue('stepPercent', Math.ceil(100 / days));
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">増分（%）で指定</SelectItem>
                <SelectItem value="days">切り替え日数で指定</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            {transitionMode === 'percent' ? (
              <>
                <Label htmlFor="stepPercent">増分ステップ（%）</Label>
                <Input id="stepPercent" type="number" min={1} max={100} {...form.register('stepPercent')} />
                <FieldError message={form.formState.errors.stepPercent?.message} />
              </>
            ) : (
              <>
                <Label htmlFor="switchDays">切り替え日数</Label>
                <Input id="switchDays" type="number" min={1} max={365} {...form.register('switchDays')} />
                <FieldError message={form.formState.errors.switchDays?.message} />
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="oldFoodAmountPerDay">{oldFoodLabel} 1日量</Label>
            <Input id="oldFoodAmountPerDay" type="number" step="0.1" {...form.register('oldFoodAmountPerDay')} />
            <FieldError message={form.formState.errors.oldFoodAmountPerDay?.message} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="newFoodAmountPerDay">{newFoodLabel} 1日量</Label>
            <Input id="newFoodAmountPerDay" type="number" step="0.1" {...form.register('newFoodAmountPerDay')} />
            <FieldError message={form.formState.errors.newFoodAmountPerDay?.message} />
          </div>

          <div className="space-y-2">
            <Label>単位</Label>
            <Select value={form.watch('unit')} onValueChange={(value: 'g' | 'cup') => form.setValue('unit', value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="g">g</SelectItem>
                <SelectItem value="cup">cup</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="startDate">開始日</Label>
            <Input id="startDate" type="date" {...form.register('startDate')} />
            <FieldError message={form.formState.errors.startDate?.message} />
          </div>

          <div className="space-y-2 md:col-span-2">
            <div className="flex items-center justify-between">
              <Label>リマインダー（複数設定可）</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ time: '08:00', enabled: true })}
              >
                <Plus className="mr-1 h-4 w-4" />
                追加
              </Button>
            </div>
            {fields.length === 0 && <p className="text-xs text-muted-foreground">未設定（通知なし）</p>}
            <div className="space-y-2">
              {fields.map((field, index) => (
                <div key={field.id} className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2">
                  <Input type="time" className="h-9 min-w-0 flex-1" {...form.register(`reminders.${index}.time`)} />
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{form.watch(`reminders.${index}.enabled`) ? 'ON' : 'OFF'}</span>
                    <Switch
                      checked={form.watch(`reminders.${index}.enabled`)}
                      onCheckedChange={(checked) => form.setValue(`reminders.${index}.enabled`, checked, { shouldDirty: true })}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={() => remove(index)}
                    aria-label={`リマインダー${index + 1}を削除`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <FieldError message={form.formState.errors.reminders?.message} />
          </div>

          <div className="space-y-2 rounded-lg border bg-muted/50 p-4 md:col-span-2">
            <p className="text-sm font-medium">通知を受け取る設定</p>
            {!pushSupported && <p className="text-xs text-muted-foreground">この環境では Push 通知が未対応です。</p>}
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
          </div>

          <div className="rounded-lg border bg-muted/50 p-4 md:col-span-2">
            <p className="text-sm font-medium">1回量プレビュー（1日量 ÷ 給餌回数）</p>
            {preview ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {oldFoodLabel}: {preview.oldPerFeeding}
                {unit} / 回 ・ {newFoodLabel}: {preview.newPerFeeding}
                {unit} / 回
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">給餌回数と1日量を入力すると表示されます。</p>
            )}
          </div>

          <div className="grid gap-2 md:col-span-2 md:flex md:justify-end">
            <Button className="w-full md:w-auto" variant="outline" type="button" onClick={() => navigate(-1)}>
              キャンセル
            </Button>
            <Button className="w-full md:w-auto" type="submit" disabled={!canSubmit}>保存</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="text-xs text-red-600">{message}</p>;
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
