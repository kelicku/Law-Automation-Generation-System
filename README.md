# AI Incident Intelligence

法律事務所向け AI 事件情報収集・コンテンツ公開プラットフォーム（初期デモ）

> 事件情報の発見から、公開の判断まで。
> 散在する公開情報をAIが整理し、法律事務所の情報発信を、より確かに、より効率的に。

**本デモに登場する企業・事件・法律事務所・人物・数値はすべて架空です。**

---

## できること（一連の業務として操作可能）

| 機能 | 画面 | 概要 |
|---|---|---|
| ダッシュボード | `/app` | 本日検出・承認待ち・重要な更新・公開中ページ・AI処理状況・操作履歴を保存データから算出 |
| AI Incident Radar | `/app/radar` | 取得→正規化→重複判定→分類→保存 をストリーミングで可視化。取得失敗・不審な命令文も表示。検索・絞り込み・並び替え |
| 事件詳細 | `/app/incidents/[id]` | 出典（正規化済み本文）、変更履歴、自所での確認状態、AI記事生成 |
| AI記事エディタ（3ペイン） | `/app/articles/[id]` | 自動保存（楽観ロック）、下書き保存、段落再生成、SEOタイトル／メタ説明／SNS投稿文生成、変更履歴・復元、公開前チェック、承認 |
| Evidence Trace | `/app/articles/[id]/evidence` | 左右分割。文を選ぶと出典の該当箇所を強調。引用が出典本文に実在するかを機械照合 |
| Smart Diff | `/app/articles/[id]/diff` | 公開版と最新版を左右比較（追加・削除・修正、文字単位ハイライト）。重要な続報で再承認待ちに |
| 承認ワークフロー | `/app/approvals` | 7状態のボード、遷移条件表、監査証跡 |
| Publication Simulator | `/app/articles/[id]/preview` | Desktop / Tablet / Mobile、公開版／承認前プレビュー、SEO・OGP・JSON-LD・サイトマップ確認 |
| 公開サイト | `/sites/[firm]`、`/sites/[firm]/[slug]` | 事務所ごとのデザイン。承認済みの版だけを公開用DBロールで表示 |
| Tenant Switcher | 画面上部 | 2つの架空事務所＋編集担当＋運営者を切替（デモ用。サーバー側認可・RLSはそのまま適用） |
| Operations Center | `/app/operations`（運営者） | 事務所別利用状況、AI上限、契約期限通知、処理失敗、実際に実行したバックアップ |
| AI Processing Inspector | `/app/inspector` | 入力要約・モデル・プロンプト版・処理時間・トークン・概算コスト・エラー |
| One-Click Demo Journey | 画面右下 | 7手順のガイド。実際の操作完了で自動的に進行 |
| Operational Savings Preview | `/app/savings`・トップページ | 入力値に基づく削減時間の試算（実測値ではない旨を明示） |

## 技術構成

- **Next.js 15.5.28（App Router）/ React 19.1 / TypeScript strict** — Node.js 22（重大な脆弱性 CVE-2025-55182 修正済みの版）
- **Tailwind CSS 3.4 + shadcn/ui 方式のコンポーネント（Radix UI）+ Lucide** / **Motion**（管理画面のみ）
- **PostgreSQL 16 + Row Level Security**（Supabase と同じ Postgres 機能のみ使用。移行手順は `docs/database.md`）
- **AI**: Anthropic API（`@anthropic-ai/sdk`、構造化出力 + Zod 検証、既定モデル `claude-opus-5-5`）。APIキー未設定時は **「AIシミュレーション」** と明示される決定的な抽出型処理で動作
- **テスト**: Vitest（単体・DB統合）/ Playwright（E2E）/ ESLint / tsc
- **公開**: Netlify（常設URL）＋ Neon PostgreSQL

```
src/
  app/                  画面（/app=管理画面, /sites=公開サイト, /api=Route Handlers）
  components/           UI（editor / evidence / diff / publish / radar / ops / shell / ui）
  lib/
    domain/             純粋なビジネスロジック（workflow, evidence, adcheck, diff, dedupe, sanitize, seo …）
    ai/                 AI層（prompts=版管理, schemas=Zod, anthropic, simulation, run=上限/冪等性/ログ）
    collector/          収集パイプライン（connectors, pipeline, events）
    server/             サービス層（articles, queries, ops, public-site, audit）
    db/                 接続プール（RLS用ユーザーコンテキスト / 公開ロール / システムジョブ）
    auth/ security/     セッション、パスワード、レート制限、ログのマスキング
    demo/               架空データ（情報源・事務所・ユーザー）と seed
db/migrations/          SQL マイグレーション
tests/                  unit / integration（RLS）/ e2e（Playwright）
docs/                   DB設計・デモ操作ガイド・テスト結果・既知の問題・ロードマップ・Lighthouse
```

UI・ビジネスロジック・AI処理・データアクセスは上記のとおり分離しています（`lib/domain` は DB や Next.js に依存しません）。

## 公開環境（常設）

- URL: **https://ai-incident-intelligence.netlify.app**（招待リンク `/invite/<DEMO_ACCESS_CODE>`）
- アプリ: Netlify（Next.js ランタイム, Node.js 22）／ DB: Neon PostgreSQL 16+（aws-us-east-2）
- 長時間かかるAI処理（記事生成・情報収集）は `JOB_MODE=background` で Netlify Background Function（最大15分）として実行し、画面は `/api/jobs/:id` をポーリングして進捗を表示します（通常の関数は約30秒で打ち切られるため）。
- 本番の環境変数は Netlify に保存（DBの所有者URLは置かず、アプリ用・システム用ロールのみ）。マイグレーションとデモデータ投入は手元から `node scripts/dev/with-prod-env.mjs npx tsx scripts/migrate.ts` で実行（`.env.netlify.local` は git 管理外）。
- 再デプロイ: `npx netlify-cli deploy --build --prod`（Node.js 22 が必要）

## セットアップ

前提: Node.js 22、Docker

```bash
npm install
cp .env.example .env.local        # 値を設定（下記）
npm run db:up                     # PostgreSQL 16 を起動（127.0.0.1:5435）
npm run db:setup                  # マイグレーション（ロール作成を含む）+ デモデータ投入
npm run build && npm run start    # http://localhost:3000
```

`.env.local` の主な値（詳細は `.env.example`）:

| 変数 | 説明 |
|---|---|
| `DATABASE_OWNER_URL` | マイグレーション専用（アプリは使用しない） |
| `DATABASE_APP_URL` | アプリ用ロール `aiip_app`（RLS 適用。パスワードはこのURLの値で作成されます） |
| `DATABASE_WORKER_URL` | システムジョブ用ロール `aiip_worker`（収集・認証照合・バックアップ・デモ初期化のみ） |
| `SESSION_SECRET` | 32バイト以上の乱数 |
| `DEMO_MODE` | `true` でワンクリックデモ・ペルソナ切替・デモ初期化を有効化。本番は `false` |
| `DEMO_ACCESS_CODE` | 設定するとデモ開始にコード入力を要求（一般公開時は推奨） |
| `ANTHROPIC_API_KEY` | 設定すると実AIで処理。未設定ならシミュレーション |
| `AI_MODEL` | 既定 `claude-opus-5-5` |
| `COLLECTOR_LIVE_RSS` / `COLLECTOR_RSS_URLS` | 実在のRSSを収集対象に追加（既定は無効・未検証） |

APIキー・DB接続情報はサーバー側のみで参照し（`server-only`）、ブラウザには送られません。

### ワンクリックでの利用開始（デモ）

- **招待リンク** `/invite/<DEMO_ACCESS_CODE>` を開くと、コードが HttpOnly Cookie に記憶され、以後の入力は不要になります（30日）。
- **ワンクリック登録**：「自分専用のデモ事務所で始める」で、架空の事務所・アカウント・サンプル記事を自動作成してログインします（月間AI上限40回、30日で失効、作成数上限 `SANDBOX_MAX`）。
- **ワンクリック再開**：再訪時は「前回の続きから再開」ボタンだけで同じ事務所に戻れます（ランダムなトークンを HttpOnly Cookie に保持し、DBにはハッシュのみ保存）。

### 共有のデモ用アカウント（架空）

| アカウント | 役割 | パスワード |
|---|---|---|
| takase@seiran.example | 青藍法律事務所・代表弁護士（承認可） | Demo-Seiran-Lawyer-2026 |
| mori@seiran.example | 青藍法律事務所・編集担当（承認不可） | Demo-Seiran-Editor-2026 |
| hiiragi@hiiragi.example | 柊総合法律事務所・所長弁護士（承認可） | Demo-Hiiragi-Lawyer-2026 |
| ops@aiip.example | プラットフォーム運営者 | Demo-Operator-2026 |

デモ全体は運営者アカウントのユーザーメニュー「デモ全体を初期化」または `npm run db:seed` で初期状態に戻せます。

## スクリプト

| コマンド | 内容 |
|---|---|
| `npm run typecheck` / `npm run lint` | 型検査 / ESLint |
| `npm run test:unit` | ドメインロジック・AI出力検証・入力無害化などの単体テスト |
| `npm run test:integration` | DBに直接接続し、RLS・ロール・公開トリガーを検証 |
| `npm run test:e2e` | 本番ビルドを起動して Playwright で主要操作を再現（事前に `npm run build`） |
| `bash scripts/lighthouse.sh` | 主要画面の Lighthouse 計測（`DEMO_CODE` `CHROME_PATH` を指定） |
| `npm run tunnel` | `cloudflared tunnel --url http://localhost:3000` |
| `npx tsx scripts/generate-login-art.ts` | ログイン画面の写真素材を OpenAI 画像生成で再作成（`.env` の `OPEN_API_KEY` を使用。生成物は `public/images/login/` に静的ファイルとして保存され、アプリ実行時にキーは使いません。プロンプトは同フォルダの `*.prompt.txt`） |

## セキュリティ設計（要約）

- **認証**: サーバーセッション（ランダムトークンを SHA-256 で保存、HttpOnly / SameSite=Lax / HTTPS時 Secure、8時間）。パスワードは scrypt
- **認可**: ロール（代表弁護士・弁護士・編集担当・閲覧）をサーバーで検証し、さらに **PostgreSQL RLS** で事務所間を分離。承認・公開は RLS ポリシーでも弁護士に限定
- **未承認公開の防止**: アプリの状態遷移チェック ＋ DB トリガー（承認済みの同一バージョンを参照しない公開ページは作成不可）
- **公開サイト**: 権限の限られた `aiip_public` ロール（`SET LOCAL ROLE`）で読み込み、公開中ページと公開用カラムのみ参照可能
- **CSRF**: 状態を変更する API は Origin ヘッダーを検証（middleware）＋ SameSite Cookie
- **入力検証**: 全 API で Zod。SQL はすべてパラメータ化。記事は HTML ではなく構造化データで保存し React がエスケープ
- **外部情報源**: HTML除去・サイズ制限・命令文（プロンプトインジェクション）検出。AIには `<untrusted_source>` で隔離して渡し、出力は Zod で再検証
- **レート制限**・**監査ログ**（アプリロールは追記のみ）・**エラーログの機密情報マスキング**・CSP 等のセキュリティヘッダー

詳細は `docs/database.md`、検証結果は `docs/test-report.md` を参照してください。

## ドキュメント

- [データベース構成資料](docs/database.md)
- [デモ操作ガイド](docs/demo-guide.md)
- [テスト結果](docs/test-report.md)
- [既知の問題](docs/known-issues.md)
- [商用版で追加すべき機能](docs/roadmap.md)
