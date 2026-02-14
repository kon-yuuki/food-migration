import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Download, Plus, Trash2, Upload } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { listPlans, deletePlan, listChecks } from '@/features/plans/repository';
import { createBackupData, restoreBackupData } from '@/features/plans/backup';
import { calculateSchedule, getTransitionSummary } from '@/features/schedule/calculate';
import { type Plan } from '@/features/plans/types';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useUserMode } from '@/features/ui/user-mode';
import { buildCheckMap } from '@/features/checklist/utils';
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

export function DashboardPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [checkMapByPlanId, setCheckMapByPlanId] = useState<Record<string, Record<string, boolean>>>({});
  const [loading, setLoading] = useState(true);
  const [backupMessage, setBackupMessage] = useState<string>();
  const [backupLoading, setBackupLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { mode } = useUserMode();

  async function load() {
    setLoading(true);
    const nextPlans = await listPlans();
    setPlans(nextPlans);

    const pairs = await Promise.all(
      nextPlans.map(async (plan) => {
        const checks = await listChecks(plan.id);
        return [plan.id, buildCheckMap(checks)] as const;
      })
    );
    setCheckMapByPlanId(Object.fromEntries(pairs));
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const overview = useMemo(() => {
    if (plans.length === 0) {
      return { total: 0, active: 0, done: 0, progress: 0 };
    }
    let active = 0;
    let done = 0;
    let progressSum = 0;

    for (const plan of plans) {
      const checkMap = checkMapByPlanId[plan.id] ?? {};
      const progress = computePlanProgressPercent(plan, checkMap);
      progressSum += progress;
      if (progress >= 100) {
        done += 1;
      } else {
        active += 1;
      }
    }

    return {
      total: plans.length,
      active,
      done,
      progress: Math.round(progressSum / plans.length)
    };
  }, [plans, checkMapByPlanId]);
  const hasPlans = overview.total > 0;

  if (loading) {
    return <p className="text-sm text-muted-foreground">読み込み中...</p>;
  }

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Food Migration ダッシュボード</h1>
      <Card className="dev-surface">
        <CardHeader className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-xl sm:text-2xl">{mode === 'engineer' ? 'Migration Overview' : '全体の進み具合'}</CardTitle>
              <CardDescription>
                {mode === 'engineer'
                  ? '全プランの平均進捗を表示（各プラン進捗の平均値）'
                  : '登録しているすべてのプランの平均進捗です。'}
              </CardDescription>
            </div>
            <Button className="w-full sm:w-auto" onClick={() => navigate('/plans/new')}>
              <Plus className="mr-2 h-4 w-4" />
              プラン作成
            </Button>
          </div>

          {mode === 'engineer' ? (
            <>
              <div className="cli-progress-track flex">
                {hasPlans ? (
                  <>
                    <div className="h-full transition-all" style={{ width: `${overview.progress}%`, backgroundColor: '#10b981' }} />
                    <div className="h-full transition-all" style={{ width: `${100 - overview.progress}%`, backgroundColor: '#d97706' }} />
                  </>
                ) : (
                  <div className="h-full w-full bg-muted/50" />
                )}
              </div>
              {hasPlans && <MixLegend />}
              <p className="metric text-xs text-muted-foreground">state: {String(overview.progress).padStart(3, ' ')}%</p>
            </>
          ) : (
            <>
              <div className="progress-track h-4 overflow-hidden rounded-full flex">
                {hasPlans ? (
                  <>
                    <div className="h-full transition-all" style={{ width: `${overview.progress}%`, backgroundColor: '#10b981' }} />
                    <div className="h-full transition-all" style={{ width: `${100 - overview.progress}%`, backgroundColor: '#d97706' }} />
                  </>
                ) : (
                  <div className="h-full w-full bg-muted/50" />
                )}
              </div>
              {hasPlans && <MixLegend />}
              <p className="text-sm text-muted-foreground">
                全体進捗: <span className="metric text-foreground">{overview.progress}%</span>
              </p>
            </>
          )}

          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <Stat label={mode === 'engineer' ? 'Avg Progress' : '全体進捗'} value={`${overview.progress}%`} />
            <Stat label={mode === 'engineer' ? 'Total Plans' : 'プラン数'} value={`${overview.total}`} />
            <Stat label={mode === 'engineer' ? 'Active' : '進行中'} value={`${overview.active}`} />
            <Stat label={mode === 'engineer' ? 'Done' : '完了'} value={`${overview.done}`} />
          </div>
        </CardHeader>
      </Card>

      <Card className="dev-surface">
        <CardHeader>
          <CardTitle className="text-base">データバックアップ</CardTitle>
          <CardDescription>JSONでエクスポート/インポートできます（クラウド同期の代替運用）。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={backupLoading}
              onClick={async () => {
                setBackupLoading(true);
                setBackupMessage(undefined);
                try {
                  const data = await createBackupData();
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `food-migration-backup-${formatDate(new Date())}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                  setBackupMessage('バックアップをダウンロードしました。');
                } catch {
                  setBackupMessage('バックアップの作成に失敗しました。');
                } finally {
                  setBackupLoading(false);
                }
              }}
            >
              <Download className="mr-2 h-4 w-4" />
              バックアップ保存
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={backupLoading}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              バックアップ復元
            </Button>
            <input
              ref={fileInputRef}
              className="hidden"
              type="file"
              accept="application/json"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) {
                  return;
                }

                setBackupLoading(true);
                setBackupMessage(undefined);
                try {
                  const text = await file.text();
                  await restoreBackupData(text, 'merge');
                  await load();
                  setBackupMessage('バックアップを復元しました（マージ）。');
                } catch {
                  setBackupMessage('バックアップの復元に失敗しました。形式を確認してください。');
                } finally {
                  setBackupLoading(false);
                  event.target.value = '';
                }
              }}
            />
          </div>
          {backupMessage && <p className="text-xs text-muted-foreground">{backupMessage}</p>}
        </CardContent>
      </Card>

      {plans.length === 0 && (
        <Card className="dev-surface">
          <CardHeader>
            <CardTitle>まだプランがありません</CardTitle>
            <CardDescription>最初の切り替えプランを作成してください。</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button asChild>
              <Link to="/plans/new">作成する</Link>
            </Button>
          </CardFooter>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {plans.map((plan) => {
          const schedule = calculateSchedule(plan);
          const progress = computePlanProgressPercent(plan, checkMapByPlanId[plan.id] ?? {});
          const remaining = 100 - progress;
          const isDone = progress >= 100;

          return (
            <Card key={plan.id} className="dev-surface">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className={mode === 'engineer' ? 'dashboard-plan-title' : undefined}>
                      <Link to={`/plans/${plan.id}`} className="hover:underline underline-offset-2">
                        {plan.petName}
                      </Link>
                    </CardTitle>
                    <CardDescription className="mt-3">
                      {plan.feedingTimesPerDay}回/日・{getTransitionSummary(plan)}
                    </CardDescription>
                    {mode === 'engineer' && <p className="metric mt-2 text-[11px] text-muted-foreground">Updated {formatUpdatedAgo(plan.updatedAt)}</p>}
                  </div>
                  <Badge className="metric" variant={isDone ? 'secondary' : 'default'}>
                    {isDone ? '完了' : '進行中'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="metric">開始日: {plan.startDate}</p>
                <p className="metric">期間: {schedule.length}日 ({plan.unit})</p>
                {mode === 'engineer' ? (
                  <>
                    <div className="cli-progress-track flex">
                      <div className="h-full transition-all" style={{ width: `${progress}%`, backgroundColor: '#10b981' }} />
                      <div className="h-full transition-all" style={{ width: `${remaining}%`, backgroundColor: '#d97706' }} />
                    </div>
                    <MixLegend />
                    <p className="metric text-[11px] text-muted-foreground">state: {String(progress).padStart(3, ' ')}%</p>
                  </>
                ) : (
                  <>
                    <div className="progress-track h-3 overflow-hidden rounded-full flex">
                      <div className="h-full transition-all" style={{ width: `${progress}%`, backgroundColor: '#10b981' }} />
                      <div className="h-full transition-all" style={{ width: `${remaining}%`, backgroundColor: '#d97706' }} />
                    </div>
                    <MixLegend />
                    <p className="text-xs text-muted-foreground">進み具合: <span className="metric text-foreground">{progress}%</span></p>
                  </>
                )}
              </CardContent>
              <CardFooter className="grid gap-2 sm:flex sm:justify-between">
                <Button className="w-full sm:w-auto" variant="outline" asChild>
                  <Link to={`/plans/${plan.id}`}>詳細</Link>
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
                      <DialogTitle>プランを削除しますか？</DialogTitle>
                      <DialogDescription>この操作は取り消せません。</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button variant="outline">キャンセル</Button>
                      </DialogClose>
                      <Button
                        onClick={async () => {
                          await deletePlan(plan.id);
                          await load();
                        }}
                      >
                        削除する
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/70 bg-muted/30 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="metric mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function MixLegend() {
  return (
    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: '#10b981' }} />
        新餌
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: '#d97706' }} />
        旧餌
      </span>
    </div>
  );
}

function computePlanProgressPercent(plan: Plan, checkMap: Record<string, boolean>): number {
  const schedule = calculateSchedule(plan);
  const totalChecks = schedule.length * plan.feedingTimesPerDay;

  if (totalChecks === 0) {
    return 0;
  }

  let done = 0;
  for (const day of schedule) {
    for (let mealIndex = 1; mealIndex <= plan.feedingTimesPerDay; mealIndex += 1) {
      if (checkMap[`${day.date}:${mealIndex}`]) {
        done += 1;
      }
    }
  }

  return Math.round((done / totalChecks) * 100);
}

function formatUpdatedAgo(updatedAt: string): string {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return formatDistanceToNow(date, { addSuffix: true });
}
