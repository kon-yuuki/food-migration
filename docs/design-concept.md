# デザインコンセプト: Food Migration

## 1. テーマ
**Precision & Minimalist Management**

可愛らしさや過剰な装飾を避け、開発者ツールのように「正確性」と「進捗の可視化」を優先する。

## 2. ビジュアルスタイル

### 2.1 カラーパレット
GitHub Dark に近いトーンを基調にし、旧餌/新餌を明確に色分けする。

| 要素 | 色 | 役割 |
|---|---|---|
| Base | `#0d1117` | 背景。集中しやすいダークトーン |
| New Food | `#238636` | 新餌。完了/前進を示す |
| Old Food | `#d29922` | 旧餌。移行中/注意を示す |
| Text | `#c9d1d9` | 本文テキスト |
| Border | `#30363d` | 区切り線/カード境界 |

### 2.2 タイポグラフィ
- メイン: `IBM Plex Sans`, `Noto Sans JP` 系
- 数値/ログ: `JetBrains Mono`, `Roboto Mono` 系

数値表示は等幅フォントを使い、計量値・進捗値・時刻の視認性を上げる。

## 3. 主要コンポーネント

### 3.1 Migration Graph（メインカレンダー）
GitHub のコントリビューショングラフを参考にしたタイル表示。

- 1日の目標食数に対する達成数で色が段階変化
- 未実施はグレー、完了で濃いグリーン
- 小さな角丸の正方形タイルをグリッドで配置

### 3.2 Meal Commit View（給餌チェック）
食事を「コミット」として扱う。

- Diff表示: 例 `+15g`（新餌）/ `-15g`（旧餌）
- チェック時は `Committed` ステータスへ変化
- モバイルで押しやすいタップ領域を確保

### 3.3 Progress Overview（全体進捗）

- Deployment Bar: 移行全体の進捗率を示す太めのバー
- Stats Card: `Day 4 / 7`, `Next Meal: 19:00` などを簡潔表示

## 4. 画面レイアウト

### 4.1 ダッシュボード
- Header: `Food Migration` と対象ペット
- Top: 全体進捗バー
- Middle: Migration Graph
- Bottom: 当日の食事リスト（コミットボタン）

### 4.2 設定画面
- 入力欄は簡潔にし、単位や数値は等幅フォントで表示
- 変更結果を即時プレビュー（ターミナル風の連続表示）

## 5. インタラクション
- チェック時に即時フィードバック（色変化/状態変化）
- モバイル片手操作を前提に主要アクションは下部寄せ
- 通知・進捗更新は遅延なく反映

## 6. 実装メモ
- 色・余白・境界線はCSS変数で一元管理
- 重要数値は `font-mono` 適用
- レスポンシブは mobile-first を維持

npx wrangler pages secret put VITE_WEB_PUSH_PUBLIC_KEY --project-name food-migration
npx wrangler pages secret put VITE_PUSH_API_BASE_URL --project-name food-migration
