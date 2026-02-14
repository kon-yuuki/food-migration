# 実装Issueリスト（MVP + Push）

このドキュメントは `docs/prd.md` を実装するための Issue 分解。  
優先度は `P0 > P1 > P2`。

## 実装ステータス（2026-02-13）
- `DONE`: 実装済み
- `IN_PROGRESS`: 実装中
- `PARTIAL`: 一部実装済み
- `TODO`: 未着手
- `OUT_OF_SCOPE`: 今回は実装対象外

## ステータス一覧（2026-02-13）
| Issue | Status | メモ |
|---|---|---|
| ISSUE-001 | DONE | Vite/TS/Lint/Format/alias 設定済み |
| ISSUE-002 | DONE | Tailwind + shadcn/ui相当コンポーネント導入済み |
| ISSUE-003 | DONE | 型定義（Plan/DaySchedule/FeedCheck）実装済み |
| ISSUE-004 | DONE | DexieスキーマとCRUD実装済み |
| ISSUE-005 | DONE | 計算ロジックとテスト追加済み |
| ISSUE-006 | DONE | Create/Edit画面 + バリデーション実装済み |
| ISSUE-007 | DONE | Dashboard画面実装済み |
| ISSUE-008 | DONE | Detail画面 + チェック永続化実装済み |
| ISSUE-009 | DONE | カレンダー/タイムライン切替実装済み |
| ISSUE-010 | DONE | PWA設定（manifest, SW登録）実装済み |
| ISSUE-011 | DONE | Web Push購読UI + Cloudflare Worker + D1保存 + テスト配信確認済み |
| ISSUE-012 | OUT_OF_SCOPE | 同期は今回は不要（要件から除外） |
| ISSUE-013 | DONE | デザインコンセプト準拠の見た目調整を反映 |
| ISSUE-014 | DONE | `npm run push:broadcast` を追加 |
| ISSUE-015 | DONE | 404/410 自動削除 + deleted件数返却 |
| ISSUE-016 | DONE | `docs/push-operations.md` を整備 |
| ISSUE-017 | DONE | 通知設定UX改善（購読状態/許可状態/解除導線） |
| ISSUE-018 | DONE | PWAアイコン差し替え + manifest色更新 |
| ISSUE-019 | DONE | データ同期代替としてバックアップ/復元を実装 |
| ISSUE-020 | DONE | Migration GraphをGitHubスタイルに再実装 |
| ISSUE-021 | DONE | 切り替え設定を `%` と `日数` で選択可能に対応 |
| ISSUE-022 | DONE | 旧エサ名/新エサ名の任意入力 + タイムライン表示対応 |
| ISSUE-023 | DONE | 保存後の遷移をDashboardへ統一 |
| ISSUE-024 | DONE | ヘッダーのモバイル崩れ修正（ナビ折り返し/コントロール整理） |
| ISSUE-025 | DONE | 表示モード/テーマ切替UIをドロップダウン化 |
| ISSUE-026 | DONE | リマインダー編集時に時刻入力が閉じる不具合を修正 |
| ISSUE-027 | DONE | リマインダー保存時の成功フィードバック追加 |
| ISSUE-028 | PARTIAL | 通知トグルをフォーム画面にも表示（導線改善） |
| ISSUE-029 | DONE | Worker Cron（毎分）で端末ローカル時刻のリマインダー自動配信を実装 |
| ISSUE-030 | DONE | リマインダー情報のサーバー保存API実装（`/api/reminders/sync` + D1テーブル） |
| ISSUE-031 | DONE | リマインダー保存時/Push ON時のフロント→Worker同期を実装 |
| ISSUE-032 | DONE | 通知UX調整（文言明確化・同期結果メッセージ） |

## 実装完了までの残タスク
- P0
  - Cloudflare適用作業（D1 migration / Worker deploy / Secrets設定）
- P1
  - 実機での時刻通知E2E検証（アプリ終了状態で通知受信）
- P2
  - Cloudflare運用ドキュメント最終更新（Cron運用・障害時手順）

## 任意タスク
- ISSUE-017: 通知設定UX改善（購読状態表示・許可状態表示・解除導線を強化） [DONE]
- ISSUE-018: PWAアイコン/manifestの整備（`pwa-192.png`, `pwa-512.png` 差し替え） [DONE]
- ISSUE-019: 機種変更/端末引き継ぎ用にバックアップ/復元を実装 [DONE]

## 最終検証チェックリスト
- `npm run lint` が通る
- `npm run test` が通る
- `npm run build` が通る
- Cloudflare Worker `GET /api/health` が `ok:true`
- 実機で `Push購読を有効化` 後、テスト通知が受信できる
- （完了条件）アプリを閉じた状態でも、設定したリマインダー時刻に自動でPushが届く
