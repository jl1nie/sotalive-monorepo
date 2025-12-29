# Cloudflare移行計画: sotalive-vercel → Cloudflare Pages

## 概要

フロントエンド(sotalive-vercel)をVercelからCloudflare Pages + Workers へ移行。
バックエンド(sotaapp2)は既にFly.ioで稼働中、全APIはRust実装済み。

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│                  Cloudflare Pages                            │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  静的ファイル: myact/, logconv/, wspr/                  │ │
│  │  Workers: _middleware.ts (API proxy + routing)         │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              ↓ /api/*
┌─────────────────────────────────────────────────────────────┐
│                      Fly.io                                  │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  sotaapp2 (Rust/Axum) - REST API + SQLite              │ │
│  │  - /api/v2/search, /api/v2/activation/*                │ │
│  │  - /api/v2/sota/*, /api/v2/pota/*                      │ │
│  │  - /api/v2/logconv/*, /api/v2/fle/*                    │ │
│  │  - /api/v2/wspr/svg                                     │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## サブドメイン構成

| サブドメイン | アプリ | ステータス |
|------------|--------|----------|
| myact2.sotalive.net | MyActivation | 稼働中 |
| logconv2.sotalive.net | LogConverter | 稼働中 |
| *.sotalive.net | Vercel | 継続運用 |

## 移行フェーズ

| Phase | 内容 | ステータス |
|-------|------|----------|
| Phase 1 | Cloudflare Pages移行、プロキシ | **完了** ✅ |
| Phase 2 | wspr.py → Rust移行 (plotters) | **完了** ✅ |
| Phase 3a | convutil.py → Rust (ADIF/CSV) | **完了** ✅ |
| Phase 3b | FLEパーサー → Rust | **完了** ✅ |
| Phase 3c | ハンドラー統合・テスト | **完了** ✅ |
| Phase 4 | Cloudflare最適化 | 未着手 |
| Phase 5 | フロントエンドReact移行 | 未着手 |

## Phase 4: Cloudflare最適化（未着手）

1. Cloudflareキャッシュルール最適化
2. モニタリング設定

※ Vercelは継続運用（停止しない）

## Phase 5: React + TypeScript移行（計画）

### 目的

- jQuery/Bootstrap 4 → React 18 + TypeScript
- CDN依存 → npm管理
- グローバル変数 → ES Modules
- Vite + Vitest でモダン開発環境

### 移行ステップ

1. **環境構築** - Vite + React + TS + Vitest
2. **型定義** - API応答、地図、設定の型定義
3. **地図コンポーネント** - Leaflet → react-leaflet
4. **状態管理** - Zustand導入
5. **UI移行** - Bootstrap → Tailwind or MUI
6. **テスト** - Vitest + Testing Library

詳細は [react-migration-plan.md](./react-migration-plan.md) 参照。

## 関連リポジトリ

- **sotaapp2**: バックエンドAPI (Rust/Axum) + 管理画面 (SvelteKit) - `/home/minoru/src/sotaapp2`
- **sotalive-vercel**: 旧フロントエンド（Vercel） - 移行後停止予定

## 注意: 管理画面について

管理画面（admin）はsotaapp2リポジトリ内でSvelteKitで実装されており、このモノレポ（sotalive-monorepo）には含まれない。
sotalive-monorepoはユーザー向けフロントエンド（myact, logconv）のみを管理する。

## 作成日
2024-12-28（移行元: sotaapp2/.serena/memories/cloudflare-migration-plan.md）
