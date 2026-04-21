# NexWork — チーム向けプロジェクト・タスク管理アプリケーション

![NexWork](./NexWork.png)

## プロジェクト概要

**NexWork** は、チームのプロジェクト進行を一元管理するための Web アプリケーションです。
単なるタスク管理ツールに留まらず、ボード / リスト / ガントチャート / カレンダー / WBS / ワークロードなど **6 種類のビュー**でタスクを可視化し、**リアルタイム同期**と **AI アシスタント**によって、実務レベルのプロジェクト管理体験を提供することを目指して設計・実装しました。

個人開発プロジェクトとして、モダンな技術スタック（Next.js 16 / React 19 / NestJS 11）のキャッチアップと、フルスタック開発における設計力・実装力の証明を目的に制作しています。

## 制作の背景・狙い

- **実務で使われている技術スタックの習得** — Next.js App Router・Server Components、NestJS、Prisma、WebSocket、LLM API など、モダンな現場で要求される技術を一通り実装
- **フロントエンド / バックエンド / インフラまで一気通貫**で設計する力を養う
- **単なる CRUD では終わらせない** — ガントチャートのクリティカルパス計算、LLM の Tool Calling、リアルタイム通知など、アルゴリズム・非同期処理・状態管理の難所を意識的に盛り込んだ

## 技術的なハイライト

### 1. LLM Tool Calling による AI アシスタント

Anthropic Claude / Google Gemini / OpenAI を抽象化した **Provider パターン**で実装。ユーザーのページ文脈（現在開いているプロジェクト・タスク）を認識し、自然言語からタスクの作成・検索・更新が可能です。

- `backend/src/ai-chat/providers/` — 3 つの LLM プロバイダーを同一インターフェースで扱う Factory パターン
- `backend/src/ai-chat/tools/task-tools.ts` — Function Calling のツール定義（タスク作成・一覧・更新など）
- `backend/src/ai-chat/ai-chat.gateway.ts` — WebSocket でストリーミング応答

### 2. ガントチャート & クリティカルパス

`frontend/components/tasks/gantt-chart.tsx` (約 1,500 行) に以下を実装：

- タスク依存関係の DAG 可視化
- **クリティカルパス自動計算**（最長経路問題を解いて表示）
- ドラッグによる期間変更 / 依存線の描画
- iCal 形式でのカレンダーエクスポート（`backend/src/tasks/ical.service.ts`）

### 3. リアルタイム同期（WebSocket）

NestJS Gateway + Socket.IO でタスク更新・通知をリアルタイム配信。
プロジェクトごとの Room 分離、接続ユーザー管理、フロント側は Zustand ストアと統合して楽観的更新にも対応。

### 4. 複雑なデータモデリング

`backend/prisma/schema.prisma` — **20 モデル / 10 マイグレーション**で、以下を正規化して表現：

- タスクの多対多アサイン（`TaskAssignee`）、依存関係（`TaskDependency` 自己参照）
- 工数記録（`TimeEntry`）、マイルストーン、タグ、添付、コメント、アクティビティログ
- プロジェクト招待、ロール管理（オーナー / 管理者 / メンバー）
- AI チャット会話履歴（`ChatConversation` / `ChatMessage`）

### 5. 多様なビュー実装

同一データを **6 つの異なるビュー**で表現：

| ビュー | 実装 | 特徴 |
|--------|------|------|
| カンバンボード | `task-board.tsx` | dnd-kit でドラッグ&ドロップ |
| リスト | `task-list.tsx` | 一括操作・フィルタ |
| カレンダー | `task-calendar*.tsx` | 月 / 週 / 日ビュー |
| ガントチャート | `gantt-chart.tsx` | 依存関係・クリティカルパス |
| WBS | `wbs-view.tsx` | 階層構造での表示 |
| ワークロード | プロジェクトページ内 | メンバー別稼働可視化 |

### 6. レポート機能

`frontend/components/reports/` 配下に以下を Recharts で実装：

- **バーンダウンチャート** — 理想線 vs 実績線
- **ベロシティ** — スプリント単位の消化ポイント
- **メンバー生産性** — アサイン・完了数の集計

## 主な機能

- **プロジェクト管理** — 招待（メール / トークン）、ロール管理、お気に入り
- **タスク管理** — 作成・編集・一括操作・ドラッグ&ドロップ・サブタスク・タグ・コメント・添付ファイル・工数記録
- **マイルストーン** — 期日管理・進捗可視化
- **通知** — WebSocket 経由のリアルタイム配信 + 既読管理
- **AI チャット** — ページ文脈認識・Tool Calling 対応（Claude / Gemini / OpenAI）
- **タスクテンプレート** — よく使うタスクをテンプレート化して再利用
- **ダッシュボード** — アクティビティフィード・完了トレンドチャート
- **iCal エクスポート** — Google Calendar 等との連携

## 技術スタック

### フロントエンド

| 技術 | バージョン | 用途 |
|------|-----------|------|
| Next.js | 16 | App Router, Server Components |
| React | 19 | UI |
| TypeScript | 5 | 型安全性 |
| Tailwind CSS | 4 | スタイリング |
| Zustand | 5 | クライアント状態管理 |
| TanStack Query | 5 | サーバー状態・キャッシング |
| Recharts | 3 | グラフ描画 |
| Radix UI | - | アクセシブルなプリミティブ |
| dnd-kit | 6 | ドラッグ&ドロップ |
| Socket.IO Client | 4 | リアルタイム通信 |
| Zod | 4 | バリデーション |
| React Hook Form | 7 | フォーム管理 |

### バックエンド

| 技術 | バージョン | 用途 |
|------|-----------|------|
| NestJS | 11 | フレームワーク |
| TypeScript | 5 | 型安全性 |
| Prisma | 5 | ORM・マイグレーション |
| PostgreSQL | 15 | RDBMS |
| Redis | 7 | キャッシュ・セッション |
| Socket.IO | 4 | WebSocket |
| Passport (JWT) | - | 認証 |
| class-validator | - | DTO バリデーション |
| @nestjs/throttler | - | レート制限 |
| Anthropic / Google GenAI / OpenAI SDK | - | LLM 統合 |
| nodemailer | - | メール送信 |

### インフラ・開発環境

- Docker Compose（PostgreSQL + Redis）
- Jest（単体テスト）
- ESLint + Prettier

## アーキテクチャ

```
┌────────────────────────────────────────────────┐
│  Next.js 16 (App Router)                       │
│  ├─ Zustand (クライアント状態)                 │
│  ├─ TanStack Query (サーバー状態)              │
│  └─ Socket.IO Client (リアルタイム)            │
└──────────────────┬─────────────────────────────┘
                   │ REST + WebSocket
┌──────────────────▼─────────────────────────────┐
│  NestJS 11                                     │
│  ├─ Auth (JWT / Passport)                      │
│  ├─ Tasks / Projects / Milestones / ...        │
│  ├─ AI Chat (Provider Factory + Tool Calling)  │
│  └─ WebSocket Gateway                          │
└──────┬───────────────┬───────────────┬─────────┘
       │               │               │
  ┌────▼─────┐   ┌────▼─────┐   ┌─────▼──────┐
  │PostgreSQL│   │  Redis   │   │ LLM APIs   │
  │ (Prisma) │   │ (Cache)  │   │Claude/GPT..│
  └──────────┘   └──────────┘   └────────────┘
```

## プロジェクト構成

```
Task/
├── backend/
│   ├── prisma/              # スキーマ (20 models) / マイグレーション / シード
│   └── src/
│       ├── ai-chat/         # LLM 統合 (Provider パターン + Tool Calling)
│       │   ├── providers/   # Anthropic / Gemini / OpenAI
│       │   └── tools/       # Function Calling 定義
│       ├── auth/            # JWT 認証・パスワードリセット
│       ├── common/          # 共通モジュール・ガード
│       ├── email/           # メール送信
│       ├── milestones/      # マイルストーン
│       ├── notifications/   # 通知
│       ├── projects/        # プロジェクト・招待・メンバー
│       ├── tags/            # タグ
│       ├── task-templates/  # タスクテンプレート
│       ├── tasks/           # タスク・iCal エクスポート
│       ├── users/           # ユーザー
│       └── websockets/      # リアルタイム配信ゲートウェイ
├── frontend/
│   ├── app/
│   │   ├── (auth)/          # ログイン・登録
│   │   └── (dashboard)/     # ダッシュボード配下ページ
│   ├── components/
│   │   ├── tasks/           # ボード / リスト / ガント / カレンダー / WBS
│   │   ├── reports/         # バーンダウン / ベロシティ / 生産性
│   │   ├── dashboard/       # アクティビティ / トレンド
│   │   ├── chat/            # AI チャット UI
│   │   └── ui/              # Radix ベースのプリミティブ
│   ├── lib/                 # Zustand ストア・ユーティリティ
│   └── services/            # API クライアント
├── docker-compose.yml
└── README.md
```

## セットアップ

### 前提条件

- Node.js 20+
- Docker & Docker Compose

### 手順

```bash
# 1. リポジトリのクローン
git clone <repository-url>
cd Task

# 2. インフラ起動（PostgreSQL + Redis）
docker compose up -d

# 3. バックエンド
cd backend
cp .env.example .env
npm install
npx prisma migrate dev
npx prisma db seed
npm run start:dev          # http://localhost:3001

# 4. フロントエンド（別ターミナル）
cd frontend
cp .env.local.example .env.local
npm install
npm run dev                # http://localhost:3000
```

### 環境変数

**backend/.env**

```env
DATABASE_URL=postgresql://taskUser:taskpass@localhost:5432/taskmanagement
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-jwt-secret

# AI チャット（使用するプロバイダーのキーを設定）
ANTHROPIC_API_KEY=
GOOGLE_AI_API_KEY=
OPENAI_API_KEY=

# メール送信（任意）
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
```

**frontend/.env.local**

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## 開発コマンド

```bash
# バックエンド
npm run start:dev       # 開発サーバー（ホットリロード）
npm run build           # ビルド
npm run test            # Jest テスト実行
npx prisma studio       # DB GUI

# フロントエンド
npm run dev             # 開発サーバー
npm run build           # 本番ビルド
npm run lint            # ESLint
```
