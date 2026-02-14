import { Link } from 'react-router-dom';
import { BellRing, Info, ListChecks, PawPrint } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function AboutPage() {
  return (
    <div className="space-y-4">
      <h1 className="sr-only">Food Migration について</h1>
      <Card className="dev-surface">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5 text-primary" />
            このアプリについて
          </CardTitle>
          <CardDescription>
            Food Migration は、ペットのフード切り替えを日ごとに管理するためのアプリです。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>旧フードから新フードへ、無理のない割合で切り替えるための計画を作成できます。</p>
          <p>毎日の給餌量を自動計算し、チェックリストで進捗を見える化します。</p>
        </CardContent>
      </Card>

      <Card className="dev-surface">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <PawPrint className="h-4 w-4 text-primary" />
            使い方（3ステップ）
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Step
            title="1. New Plan でプラン作成"
            body="ペット名、1日の給餌回数、旧餌/新餌の1日量、増分（%）または切り替え日数、開始日を入力します。"
          />
          <Step title="2. 自動計算された日程を確認" body="日ごとの旧餌/新餌の割合と1回量が表示されます。" />
          <Step title="3. 給餌ごとにチェック" body="実施した給餌をチェックして、完了までの進み具合を管理します。" />
        </CardContent>
      </Card>

      <Card className="dev-surface">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="h-4 w-4 text-primary" />
            できること
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>複数のペット・複数プランの保存</p>
          <p>リマインダー設定（時刻を複数登録）</p>
          <p>バックアップ保存 / 復元（JSON）</p>
        </CardContent>
      </Card>

      <Card className="dev-surface">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BellRing className="h-4 w-4 text-primary" />
            通知を受け取る条件
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>リマインダー時刻は「いつ通知するか」の設定です。</p>
          <p>アプリを閉じていても通知を受けるには、「通知を受け取る設定」を ON にしてください。</p>
          <p>iPhone/iPad の場合は、Safari でこのサイトをホーム画面に追加したアプリから起動して設定する必要があります。</p>
          <p>Android の場合はホーム画面追加は必須ではありません（Chrome の通知許可 + このアプリの通知設定 ON で受信可能）。</p>
          <p>そのうえで、OS とブラウザ（またはホーム画面アプリ）の通知許可を ON にしてください。</p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button asChild>
          <Link to="/plans/new">プランを作成する</Link>
        </Button>
      </div>
    </div>
  );
}

function Step({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border bg-muted/40 p-3">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
