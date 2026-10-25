# データベース構成資料

PostgreSQL 16。マイグレーションは `db/migrations/*.sql`（`npm run db:migrate` で順に適用、適用履歴は `schema_migrations`）。

| ファイル | 内容 |
|---|---|
| `0001_schema.sql` | テーブル・外部キー・一意制約・インデックス・公開トリガー |
| `0002_security.sql` | 認可用関数、権限（GRANT）、Row Level Security ポリシー |
| `0003_worker_reset.sql` | システムロールにデモ初期化（TRUNCATE）権限 |
| `0004_source_snapshot.sql` | 公開ページに出典メタデータのスナップショットを保持 |
| `0005_sandbox_accounts.sql` | ワンクリック登録（体験用事務所）と再開トークン |

## データの区分

```
            ┌──────────── 共通データ（全事務所で共有・システムのみ書き込み）────────────┐
            │ sources ─< incident_sources >─ incidents ─< incident_events               │
            │ collection_runs, collector_state                                          │
            └───────────────────────────────────────────────────────────────────────────┘
                                         │ incident_id
            ┌──────────── 事務所ごとの非公開データ（tenant_id + RLS）─────────────────┐
 tenants ─< │ tenant_incident_reviews, article_drafts ─< article_versions              │
            │ article_drafts ─< article_transitions, approvals, published_pages(1:1)    │
            │ tenant_settings(1:1), subscriptions(1:1), notifications, audit_logs,      │
            │ ai_execution_logs                                                         │
            └───────────────────────────────────────────────────────────────────────────┘
 users ─< tenant_memberships >─ tenants        sessions（システムのみ）  backup_runs（運営者）
```

## テーブル一覧

| テーブル | 役割 | 主な制約 |
|---|---|---|
| tenants | 事務所（スラッグ、ブランドカラー、ロゴ） | `slug` 一意・形式チェック、カラー形式チェック |
| users | 利用者（scrypt ハッシュ、運営者フラグ） | `email` 一意・小文字 |
| tenant_memberships | 事務所所属と役割（owner / lawyer / editor / viewer） | `(tenant_id, user_id)` 一意 |
| sessions | サーバーセッション（トークンの SHA-256 のみ保存） | 期限インデックス |
| tenant_settings | 事務所名・弁護士・相談フォームURL（https限定）・費用表示 | tenant と 1:1 |
| subscriptions | 契約プラン・期間・月間AI上限 | tenant と 1:1、`ends_on > started_on` |
| sources | 取得した情報源（正規化済み本文、ハッシュ、命令文検出結果） | `url` 一意 |
| incidents | 事件（カテゴリ、日付、影響人数と確度、分類根拠） | `fingerprint` 一意、カテゴリ・状態チェック |
| incident_sources | 事件と出典の関係（初報／続報／関連） | 複合主キー |
| incident_events | 検出・出典追加・重要な変更の履歴 | 事件・日時インデックス |
| collection_runs | 収集ジョブ（各ステップ・情報源ごとの結果） | `job_key` 一意、**実行中は1件のみ**（部分一意インデックス） |
| tenant_incident_reviews | 事件に対する事務所ごとの確認状態 | `(tenant_id, incident_id)` 主キー |
| article_drafts | 記事（7状態、**編集中の最新版**、審査中版・公開版への参照、続報情報） | `(tenant_id, slug)`・`(tenant_id, incident_id)` 一意 |
| article_versions | 記事の不変スナップショット（AI生成・保存・申請・更新案・復元） | `(article_id, version_no)` 一意、同一テナント複合FK |
| article_transitions | 状態遷移の履歴（実行者・対象バージョン・コメント） | |
| approvals | 承認／差し戻しの記録（承認者・日時・**対象バージョン**・チェック結果） | 同一テナント複合FK |
| published_pages | **承認済みの公開版**（live / suspended）と出典スナップショット | 記事と 1:1、`(tenant_id, slug)` 一意、**承認トリガー** |
| ai_execution_logs | AI処理の記録（入力要約、モデル、プロンプト版、トークン、コスト、エラー） | **`job_key` 一意（重複実行防止）** |
| notifications | 事務所向け・運営者向け通知 | `dedupe_key` 一意（契約期限通知などの重複防止） |
| audit_logs | 監査ログ | アプリロールは INSERT/SELECT のみ |
| backup_runs | バックアップ実行記録（ファイル名、サイズ、SHA-256、テーブル件数） | |
| sandbox_accounts | ワンクリック登録で作成した体験用事務所と、再開用トークンのハッシュ・有効期限 | `resume_hash` 一意。アプリロールからは参照不可（システムロールのみ） |

公開版と編集中の最新版の分離: `article_drafts.working`（編集中）と `published_pages.version_id`（承認済みの公開版）は別物で、更新案が作られても `published_pages` は変更されません。

テナント間の参照混入を防ぐため、記事系テーブルの外部キーは `(tenant_id, id)` の複合キーで張っています（別事務所の記事にバージョンや承認をぶら下げることは DB 上不可能）。

## ロールと権限

| ロール | 用途 | RLS |
|---|---|---|
| `aiip_owner` | マイグレーションのみ | — |
| `aiip_app` | Webアプリ。リクエストごとにトランザクション内で `app.user_id` / `app.tenant_id` を設定 | **適用（NOBYPASSRLS）** |
| `aiip_public` | 公開サイト。`aiip_app` が `SET LOCAL ROLE` で一時的に切り替え（`INHERIT FALSE`） | 適用 |
| `aiip_worker` | 収集・ログイン照合・バックアップ・デモ初期化（`src/lib/collector`, `src/lib/server/ops.ts` 等に限定） | BYPASSRLS |

`aiip_app` は `users.password_hash`・`sessions`・`collector_state` を参照できません。`audit_logs` の更新・削除もできません。

## RLS ポリシー（要約）

判定関数（`app` スキーマ、`SECURITY DEFINER`）:
- `app.in_active_tenant(t)` … 選択中の事務所 かつ その事務所のメンバー
- `app.can_edit(t)` … 上記かつ owner / lawyer / editor
- `app.can_approve(t)` … 上記かつ owner / lawyer
- `app.is_operator()` … 運営者

| 対象 | 参照 | 作成・更新 |
|---|---|---|
| 共通データ（incidents 等） | ログイン済みユーザー | アプリ不可（システムのみ） |
| article_drafts / versions | 自事務所 | 編集権限者 |
| approvals | 自事務所 | **弁護士のみ、かつ自分の名義のみ** |
| published_pages | 自事務所（運営者は件数集計用に参照） | **弁護士のみ** ＋ 承認トリガー |
| tenant_settings | 自事務所 | 弁護士のみ |
| subscriptions | 自事務所・運営者 | 運営者のみ |
| ai_execution_logs / notifications / audit_logs | 自事務所・運営者 | 自事務所 |
| 公開ロール | `published_pages` は `status='live'` のみ、tenants / tenant_settings は公開用カラムのみ | 不可 |

事務所IDを偽装しても（他事務所の `app.tenant_id` を設定しても）メンバーでなければ 0 件になることを統合テストで確認しています（`tests/integration/rls.test.ts`）。

## Supabase への移行

本デモは Supabase と同じ PostgreSQL 機能（RLS・ロール・トリガー）のみを使用しています。移行時は:
1. `app.current_user_id()` の実装を `auth.uid()` に置き換える（ユーザー特定はこの関数1か所に集約）
2. 選択中の事務所は JWT のカスタムクレームまたはセッション変数で渡す
3. `aiip_app` 相当は `authenticated` ロール、`aiip_public` 相当は `anon` ロールにポリシーを付与
4. マイグレーションを `supabase/migrations` に配置
