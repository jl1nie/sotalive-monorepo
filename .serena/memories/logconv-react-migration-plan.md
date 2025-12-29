# LogConverter React移行計画

## 概要

logconv（ファイル変換ツール for SOTA/JAFF/POTA）をjQuery + Bootstrap 4からReact + TypeScriptに移行する。
myactより単純な構造のため先に移行を完了させる。

## 現状分析

### ファイル構成
```
apps/logconv/
├── index.html      # 1423行（HTML + インラインJS）
├── js/             # 外部JSライブラリ（Leaflet関連等、未使用の可能性大）
├── favicon-*.png/ico
└── package.json
```

### 技術スタック（現在）
- jQuery 3.5.1
- Bootstrap 4.5.0 + MDB 4.19.1
- js-cookie
- Leaflet 1.2.0（WSPR機能で使用？）
- 全てCDN依存

### タブ構成（6タブ）
| タブ | 機能 | API |
|------|------|-----|
| SOTA/JAFF/POTA ADIF | ADIF変換（デフォルト表示） | POST /api/v2/logconv/hamlog |
| SOTA Activator | SOTA Activator CSV出力 | POST /api/v2/logconv/hamlog |
| SOTA Chaser | SOTA Chaser CSV出力 | POST /api/v2/logconv/hamlog |
| FLE Online | FLE形式パース・変換 | POST /api/v2/fle/compile, /api/v2/fle/generate |
| AirHamLog | AirHamLog形式変換 | POST /api/v2/logconv/hamlog |
| WSPRnet SNR | WSPR解析SVG生成 | POST /api/v2/wspr/svg |

### 主要機能
1. **ファイルアップロード**: CSVファイル読み込み
2. **フォーム送信**: 各種パラメータ付きPOST
3. **Cookie保存**: コールサイン等の設定保存
4. **FLEエディタ**: テキストエリアでFLE形式編集
5. **ADIF→FLE変換**: クライアントサイド変換
6. **WSPR SVG表示**: SVG画像取得・表示

### インラインJS量
- 約600行のJavaScript（817行目〜1420行目）
- myact（約1760行）の約1/3

## 移行後の技術スタック

```
React 18 + TypeScript
├── Vite              # ビルドツール
├── Zustand           # 状態管理（Cookie代替）
├── TanStack Query    # API状態管理
├── Tailwind CSS v4   # スタイリング
└── Vitest            # テスト
```

※ Leafletは不要（WSPRはSVG画像表示のみ）

## UI設計方針

- **Tailwind CSS**: ユーティリティファースト
- **ライト/ダーク切替**: システム設定連動 + 手動切替
- **モダンなデザイン**:
  - グラデーション背景
  - カードベースレイアウト
  - スムーズなトランジション
  - アイコン: lucide-react
  - レスポンシブ対応

## Reactコンポーネント設計

```
apps/logconv/
├── src/
│   ├── components/
│   │   ├── Tabs/
│   │   │   ├── TabContainer.tsx
│   │   │   ├── POTAActivatorTab.tsx    # SOTA/JAFF/POTA ADIF
│   │   │   ├── SOTAActivatorTab.tsx
│   │   │   ├── SOTAChaserTab.tsx
│   │   │   ├── FLEOnlineTab.tsx
│   │   │   ├── AirHamLogTab.tsx
│   │   │   └── WSPRTab.tsx
│   │   ├── Forms/
│   │   │   ├── FileUpload.tsx
│   │   │   ├── CallsignInput.tsx
│   │   │   ├── QTHRadioGroup.tsx
│   │   │   └── SubmitButton.tsx
│   │   └── FLE/
│   │       ├── FLEEditor.tsx
│   │       └── FLEPreview.tsx
│   ├── hooks/
│   │   ├── useFormSubmit.ts
│   │   └── usePreferences.ts
│   ├── stores/
│   │   └── prefsStore.ts      # Cookie → Zustand persist
│   ├── api/
│   │   ├── client.ts
│   │   └── types.ts
│   ├── utils/
│   │   └── adif2fle.ts        # ADIF→FLE変換
│   ├── types/
│   │   └── form.ts
│   ├── App.tsx
│   └── main.tsx
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
└── public/
    └── favicon.ico
```

## 進捗状況

| Phase | 内容 | 状態 | 完了日 |
|-------|------|------|--------|
| Phase 1 | Vite + React + TS + Tailwind環境構築 | ✅ 完了 | 2024-12-28 |
| Phase 2 | 型定義 + APIクライアント | ✅ 完了 | 2024-12-28 |
| Phase 3 | 基本コンポーネント | ✅ 完了 | 2024-12-28 |
| Phase 4 | 6タブ実装 | ✅ 完了 | 2024-12-28 |
| Phase 5 | テスト + 仕上げ | 🔄 進行中 | - |

## 実装済みファイル

```
apps/logconv/
├── src/
│   ├── components/
│   │   ├── Layout/Header.tsx        # ヘッダー + テーマ切替
│   │   ├── Tabs/
│   │   │   ├── TabContainer.tsx     # タブナビゲーション
│   │   │   ├── POTAActivatorTab.tsx # SOTA/JAFF/POTA ADIF
│   │   │   ├── SOTAActivatorTab.tsx
│   │   │   ├── SOTAChaserTab.tsx
│   │   │   ├── FLEOnlineTab.tsx     # FLEエディタ
│   │   │   ├── AirHamLogTab.tsx
│   │   │   └── WSPRTab.tsx          # WSPR SVG生成
│   │   └── Forms/
│   │       ├── FileUpload.tsx       # ドラッグ&ドロップ対応
│   │       ├── TextInput.tsx
│   │       ├── RadioGroup.tsx
│   │       └── SubmitButton.tsx
│   ├── hooks/useTheme.ts            # ダークモード切替
│   ├── stores/prefsStore.ts         # Zustand永続化ストア
│   ├── types/form.ts, api.ts        # 型定義
│   ├── App.tsx
│   └── index.css                    # Tailwind v4設定
├── vite.config.ts                   # Vitest設定含む
└── package.json
```

## 移行フェーズ（詳細）

### Phase 1: 環境構築 ✅
- [x] logconv → logconv-org にリネーム
- [x] Vite + React + TypeScript プロジェクト作成
- [x] 依存パッケージ追加（zustand, @tanstack/react-query, lucide-react, vitest）
- [x] Tailwind CSS v4設定（ダークモード対応）

### Phase 2: 型定義 + API ✅
- [x] フォームデータ型定義（types/form.ts）
- [x] API応答型定義（types/api.ts）

### Phase 3: 基本コンポーネント ✅
- [x] Header（テーマ切替ボタン付き）
- [x] TabContainer
- [x] 共通フォームコンポーネント（FileUpload, TextInput, RadioGroup, SubmitButton）
- [x] Zustand prefsStore（Cookie代替、永続化対応）
- [x] useTheme hook

### Phase 4: タブ実装 ✅
- [x] POTAActivatorTab
- [x] SOTAActivatorTab
- [x] SOTAChaserTab
- [x] AirHamLogTab
- [x] FLEOnlineTab（エディタ + サンプル読込）
- [x] WSPRTab（SVG表示）

### Phase 5: テスト + 仕上げ ✅
- [x] ローカルビルド・動作確認
- [x] Cloudflare Pagesデプロイ
- [ ] Vitestでコンポーネントテスト（今後）
- [ ] 実際のAPI動作確認（今後）

## デプロイ完了

- **デプロイ日**: 2024-12-29
- **デプロイURL**: https://5f1ba545.sotalive.pages.dev/logconv/
- **本番URL**: logconv2.sotalive.net（Cloudflare側でカスタムドメイン設定後）

## 工数見積

| Phase | 期間 | 内容 |
|-------|------|------|
| Phase 1 | 0.5日 | 環境構築 |
| Phase 2 | 0.5日 | 型定義 + API |
| Phase 3 | 1日 | 基本コンポーネント |
| Phase 4 | 1.5日 | タブ実装 |
| Phase 5 | 0.5日 | テスト + 仕上げ |
| **合計** | **4日** | |

## myactとの比較

| 項目 | logconv | myact |
|------|---------|-------|
| HTML行数 | 1,423行 | 455行（分割後） |
| JS行数 | 約600行 | 約1,760行（12モジュール） |
| タブ数 | 6 | - |
| 地図 | なし | Leaflet（複雑） |
| 状態管理 | Cookie（シンプル） | グローバル変数（複雑） |
| 難易度 | ★★☆☆☆ | ★★★★☆ |

## デプロイ構成

| 環境 | ホスティング | URL |
|------|-------------|-----|
| 既存版 | Vercel | logconv.sotalive.net |
| React版 | Cloudflare | logconv2.sotalive.net |

## 最新の改善内容 (2024-12-29)

### POTA/JAFF/SOTA ADIFタブを完全リニューアル
- **CSVプレビューテーブル**: JS版と同等の12列テーブル、エラー行ハイライト
- **リファレンス入力オプション**: form/rmks1/rmks2 選択式
- **相手局QTH指定**: none/rmks1/rmks2/qth 選択式
- **フォームバリデーション**: 
  - コールサイン必須チェック
  - リファレンス形式検証（SOTA/JAFF/POTA形式）
  - Remarks重複チェック
- **外部リンクボタン**: SOTA/JAFF/POTAアップロード先、使い方リンク
- **設定永続化**: Zustand persist（localStorage）でコールサイン等を保存

### SOTA Activator/Chaserタブ更新
- JS版と同等のオプション構成に変更
- バリデーション追加

### API対応
- Rust backend (sotaapp2) の新しいAPIエンドポイントに対応
  - `POST /api/v2/logconv/pota` - CSVチェック
  - `POST /api/v2/logconv/hamlog` - ADIF生成（ZIP）
  - JSON形式のoptionsパラメータ対応

### ストア更新
- `prefsStore.ts`: Rust API形式（myQTH, QTH等）に合わせた型定義
- 各タブ専用の設定項目追加

## 作成日
2024-12-28

## 更新日
2024-12-29
