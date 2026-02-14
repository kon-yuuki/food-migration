# Food Migration

ペットのフード切り替え（旧餌→新餌）を、日ごとの計画とチェックで管理する PWA アプリです。  
1日の給餌回数・旧餌/新餌の1日量・切り替えステップ（%または日数）から、1回量とスケジュールを自動計算します。

## 主な機能
- プラン作成/編集（旧餌・新餌名、給餌回数、切り替え方式、開始日）
- 日別タイムライン + 進捗カレンダー表示
- 給餌チェックの永続化（ローカルDB: Dexie/IndexedDB）
- リマインダー時刻の複数設定
- Push 通知（Cloudflare Workers + D1）
- バックアップ/復元（JSON）
- 表示モード切替（やさしい/詳細）とテーマ切替（ライト/ダーク）

## 技術スタック
- フロント: React + TypeScript + Vite
- UI: Tailwind CSS + Radix UI + lucide-react
- バリデーション: zod + react-hook-form
- ローカルDB: Dexie
- PWA: vite-plugin-pwa
- Push配信: Cloudflare Workers + D1
- テスト: Vitest

## セットアップ
```bash
cd /Users/kon/private-develop/food-migration
npm install
```

## ローカル起動
```bash
npm run dev
```

## npm scripts
- `npm run dev` 開発サーバー起動
- `npm run build` 本番ビルド
- `npm run preview` ビルド成果物のローカル確認
- `npm run lint` ESLint 実行
- `npm run test` Vitest 一括実行
- `npm run test:watch` Vitest watch
- `npm run push:broadcast` 管理用一斉通知送信

## 環境変数
`.env.local`（フロント用）
```env
VITE_WEB_PUSH_PUBLIC_KEY=<VAPID公開鍵>
VITE_PUSH_API_BASE_URL=https://food-migration-push.jiny5019.workers.dev
```

Worker 側は `wrangler.toml` と Secret が必要です。詳細は下記参照。

## デプロイ
基本手順（Pages 反映）
```bash
npm run build
npx wrangler pages deploy dist --project-name food-migration --branch main
```

Worker/D1/Secrets を含む手順は以下を参照:
- `docs/deploy-pages.md`
- `docs/push-operations.md`

## Push通知の注意
- アプリ内の「この端末で通知を受け取る」を ON にする必要があります。
- iPhone/iPad は Safari でホーム画面追加したアプリからの利用が前提です。
- Android はホーム画面追加なしでも動作可能ですが、通知権限とOS側設定が必要です。

## ディレクトリ概要
- `src/` フロント本体
- `worker/` Cloudflare Worker（Push API）
- `migrations/` D1 マイグレーション
- `docs/` 運用/設計ドキュメント
- `tests/` 単体テスト
- `public/` 画像・アイコン等の静的ファイル

## 補足
- 進捗表示は、チェック実績に基づく達成率で計算されます。
- `New Plan` 画面の保存はページ下部の `保存` ボタンでプラン全体を保存します（リマインダー含む）。
