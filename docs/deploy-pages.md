# Food Migration デプロイ手順

最終更新: 2026-02-13

このドキュメントは、以下を最短で実施するための手順です。
- フロント（Cloudflare Pages）反映
- Push Worker（Cloudflare Workers）反映
- Push通知の初期設定/再設定

## 1. 通常の反映（コード変更時）

```bash
cd /Users/kon/private-develop/food-migration
npm run build
npx wrangler pages deploy dist --project-name food-migration --branch main
```

補足:
- これで Pages 側（フロント）は更新されます。
- `VITE_*` を変更した場合は必ず `npm run build` が必要です（ビルド時に埋め込まれるため）。

## 2. Push Worker の反映（Worker変更時）

```bash
cd /Users/kon/private-develop/food-migration
npx wrangler deploy
```

## 3. 必須設定（初回のみ）

### 3-1. `.env.local`（フロント用）

```env
VITE_WEB_PUSH_PUBLIC_KEY=<VAPIDの公開鍵>
VITE_PUSH_API_BASE_URL=https://food-migration-push.jiny5019.workers.dev
```

### 3-2. `wrangler.toml`（Worker用）

`[vars]` に以下を設定:

```toml
VAPID_PUBLIC_KEY = "<VAPIDの公開鍵>"
```

### 3-3. Worker Secret（Cloudflare側）

```bash
# VAPID秘密鍵
printf '%s' '<VAPIDの秘密鍵>' | npx wrangler secret put VAPID_PRIVATE_KEY

# VAPID subject（通常は mailto:メールアドレス）
printf '%s' 'mailto:you@example.com' | npx wrangler secret put VAPID_SUBJECT

# 管理用トークン（ランダム長文字列）
printf '%s' '<ランダムな長い文字列>' | npx wrangler secret put PUSH_ADMIN_TOKEN
```

その後、Workerを再デプロイ:

```bash
npx wrangler deploy
```

## 4. D1マイグレーション（初回のみ）

```bash
cd /Users/kon/private-develop/food-migration
npx wrangler d1 migrations apply food-migration-db --remote
```

確認:

```bash
npx wrangler d1 execute food-migration-db --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

期待テーブル:
- `push_subscriptions`
- `reminder_schedules`
- `d1_migrations`

## 5. 動作確認コマンド

### 5-1. Worker稼働確認

```bash
curl https://food-migration-push.jiny5019.workers.dev/api/health
```

### 5-2. 鍵ペア整合チェック

```bash
export PUSH_ADMIN_TOKEN='<3-3で設定した値>'
curl -X GET "https://food-migration-push.jiny5019.workers.dev/api/vapid/check" \
  -H "x-admin-token: $PUSH_ADMIN_TOKEN"
```

期待値:
- `"ok": true`
- `"pairValid": true`

### 5-3. 一斉通知テスト

```bash
export PUSH_API_BASE_URL='https://food-migration-push.jiny5019.workers.dev'
export PUSH_ADMIN_TOKEN='<3-3で設定した値>'

npm run push:broadcast -- --title "疎通テスト" --body "通知テストです" --url "/"
```

成功例:
- `sent=1 failed=0`

## 6. つまずきやすい点（重要）

### 6-1. `VapidPkHashMismatch` が出る

原因:
- 端末のPush購読が、現在の公開鍵と違う鍵で作られている。

対処（順番厳守）:
1. `VITE_WEB_PUSH_PUBLIC_KEY` と `VAPID_PUBLIC_KEY` を同じ値にする
2. `VAPID_PRIVATE_KEY` はその公開鍵ペアの秘密鍵にする
3. Worker再デプロイ
4. フロント再ビルド + Pages再デプロイ
5. 古い購読を削除

```bash
npx wrangler d1 execute food-migration-db --remote --command "DELETE FROM push_subscriptions;"
npx wrangler d1 execute food-migration-db --remote --command "DELETE FROM reminder_schedules;"
```

6. iPhone側でホーム画面アプリを削除→再インストール→通知ON→リマインダー保存

### 6-2. `BadJwtToken` が出る

確認点:
- `VAPID_SUBJECT` が有効な形式（`mailto:...`）か
- Workerが最新デプロイ済みか
- 古い購読を使っていないか

## 7. 運用メモ

- `.env.local` はこの構成では「ただのメモ」ではなく、`npm run build` 時にフロントへ埋め込まれる。
- `PUSH_ADMIN_TOKEN` は公開しない。漏えい時は再発行して `wrangler deploy`。
- Cronは現在 `*/1 * * * *`（毎分）。本番負荷に応じて調整可能。
