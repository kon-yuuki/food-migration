# Push通知 運用手順（本番/検証）

## 0. 前提
- 日付: 2026-02-13 時点
- Worker がデプロイ済み
- D1 マイグレーション適用済み
- `PUSH_ADMIN_TOKEN` を Worker secret に登録済み

## 1. 端末の購読登録
1. アプリを開く
2. 対象プラン詳細で `Push購読を有効化` を押す
3. `Push購読を有効化してサーバーへ保存しました。` を確認

## 2. 端末側の通知確認
以下が1つでもOFFだと通知は来ない。

- Chromeサイト通知権限: `許可`
- OSのChrome通知: `ON`
- フォーカスモード/おやすみモード: `OFF`
- 省電力や通知サマリーで抑止されていない

## 3. 単体テスト通知（購読JSON指定）
`push/test` で1件に直接送る。

```bash
curl -X POST "$PUSH_API_BASE_URL/api/push/test" \
  -H "content-type: application/json" \
  -H "x-admin-token: $PUSH_ADMIN_TOKEN" \
  -d '{
    "subscription": { ...ここに購読JSONをそのまま貼る... }
  }'
```

期待値:
- `{"ok":true,"push":{"status":201,...}}`

## 4. 全体配信（運用コマンド）
`curl` ではなく、以下を使用する。

```bash
npm run push:broadcast -- --title "Food Migration 通知" --body "給餌リマインダーです" --url "/"
```

期待値:
- `Push broadcast success`
- `sent=<件数> failed=<件数> deleted=<件数>`

## 5. 失敗時の見方
- `admin_token_invalid`: トークン不一致
- `subscription_not_found`: テスト対象の購読が未登録
- `deleted > 0`: 失効購読（404/410）が自動削除された

## 6. Workerヘルス確認
```bash
curl "$PUSH_API_BASE_URL/api/health"
```

期待値:
- `{"ok":true,"service":"food-migration-push"}`
