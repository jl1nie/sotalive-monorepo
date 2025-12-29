# React + TypeScript移行計画: myact

## 進捗状況

| Phase | 内容 | 状態 | 完了日 |
|-------|------|------|--------|
| Phase 1 | Vite + React + TS環境構築 | 🔄 進行中 | - |
| Phase 2 | 型定義作成 | ⏳ 未着手 | - |
| Phase 3 | 地図コンポーネント | ⏳ 未着手 | - |
| Phase 4 | 状態管理 + API | ⏳ 未着手 | - |
| Phase 5 | UI移行 | ⏳ 未着手 | - |
| Phase 6 | テスト + 旧コード削除 | ⏳ 未着手 | - |

## ディレクトリ構成（2024-12-28更新）

```
apps/
├── myact/          # React版（新規作成）→ myact2.sotalive.net (Cloudflare)
├── myact-org/      # JSリファクタリング版 → Vercel停止後にmyact.sotalive.netへ
└── logconv/        # LogConverter
```

### 3つの環境

| 環境 | ホスティング | 技術 | URL |
|------|-------------|------|-----|
| 既存版 | Vercel | jQuery（オリジナル） | *.sotalive.net |
| JSリファクタリング版 | Cloudflare | jQuery（モジュール分割） | → myact.sotalive.net（将来） |
| React版 | Cloudflare | React + TS | myact2.sotalive.net |

## Phase 1 進捗詳細（環境構築）

### 完了
- [x] myact → myact-org にリネーム
- [x] Vite + React + TypeScript プロジェクト作成
- [x] 依存パッケージインストール:
  - react-leaflet, leaflet（地図）
  - zustand（状態管理）
  - @tanstack/react-query（API状態管理）
  - vitest, @testing-library/react（テスト）

### 残作業
- [ ] Vitest設定ファイル作成
- [ ] ESLint/Prettier設定調整
- [ ] ディレクトリ構造作成（components, hooks, stores, types, api）
- [ ] 旧myact-orgから静的アセット（img, font, favicon等）をコピー
- [ ] vite.config.ts調整（パス alias等）

---


## 概要

myact（MyActivation）をjQuery + Bootstrap 4からReact 18 + TypeScriptに移行する。

## 現状分析

### 現在の技術スタック
- jQuery 3.5.1
- Bootstrap 4.5.3
- Leaflet 1.7.1
- Chart.js 4.x
- 外部CDN依存

### 主要な課題
1. **グローバル変数** - 設定、状態がwindowスコープに散在
2. **ES Modules未使用** - `<script>`タグで読み込み順序管理
3. **ライブラリ旧版** - Bootstrap 4、古いLeaflet
4. **CDN依存** - オフライン動作不可、バージョン管理困難
5. **型安全性なし** - ランタイムエラーのリスク
6. **テストなし** - リグレッション検出不可

### 現在のJSモジュール構成（12ファイル）
```
apps/myact/js/
├── config.js      # グローバル設定、prefs
├── api.js         # fetchAPI関数
├── utils.js       # ユーティリティ関数
├── map-init.js    # Leaflet地図初期化
├── pota-log.js    # POTAログ管理
├── keyer.js       # シリアル/WiFiキーヤー
├── popup.js       # 地図ポップアップ
├── markers.js     # マーカー描画
├── geolocation.js # GPS位置取得
├── prefs.js       # Cookie設定管理
├── spots.js       # スポットチャート
├── aprs.js        # APRSトラック
└── main.js        # 初期化・イベントバインド
```

## 目標技術スタック

```
React 18 + TypeScript
├── Vite            # ビルドツール
├── react-leaflet   # 地図コンポーネント
├── Zustand         # 状態管理
├── TanStack Query  # API状態管理
├── Tailwind CSS    # スタイリング
├── Vitest          # テスト
└── Testing Library # コンポーネントテスト
```

## Reactコンポーネント設計

```
src/
├── components/
│   ├── Map/
│   │   ├── MapContainer.tsx
│   │   ├── Markers.tsx
│   │   ├── APRSTrack.tsx
│   │   └── Popup.tsx
│   ├── Spots/
│   │   ├── SpotsModal.tsx
│   │   └── SpotsChart.tsx
│   ├── Settings/
│   │   ├── SettingsModal.tsx
│   │   └── PreferencesForm.tsx
│   ├── Log/
│   │   ├── POTALogModal.tsx
│   │   └── LogTable.tsx
│   └── common/
│       ├── SearchInput.tsx
│       └── KpIndex.tsx
├── hooks/
│   ├── useGeolocation.ts
│   ├── usePreferences.ts
│   └── useSpots.ts
├── stores/
│   ├── mapStore.ts
│   └── prefsStore.ts
├── api/
│   ├── client.ts
│   └── types.ts
├── utils/
│   ├── coordinates.ts
│   └── formatting.ts
├── types/
│   ├── api.ts
│   ├── map.ts
│   └── preferences.ts
└── App.tsx
```

## 移行フェーズ

### Phase 1: 環境構築 (1-2日)

```bash
cd apps/myact
pnpm create vite . --template react-ts
pnpm add react-leaflet leaflet zustand @tanstack/react-query
pnpm add -D @types/leaflet vitest @testing-library/react
```

**成果物**:
- Vite + React + TypeScript環境
- ESLint + Prettier設定
- Vitest設定
- 既存index.htmlとの並行運用設定

### Phase 2: 型定義 (2-3日)

API応答、地図データ、設定の型定義を作成。

```typescript
// types/api.ts
interface SpotData {
  key: string;
  values: Spot[];
}

interface Spot {
  activator: string;
  reference: string;
  frequency: string;
  mode: string;
  spotTime: string;
  program: 'SOTA' | 'POTA';
  comment?: string;
}

// types/preferences.ts
interface Preferences {
  spot_period: number;
  show_potalog: boolean;
  by_call: boolean;
  pota_hunter_uuid?: string;
  aprs_track: boolean;
  // ...
}
```

### Phase 3: 地図コンポーネント (3-5日)

Leaflet → react-leafletへの移行。

```tsx
// components/Map/MapContainer.tsx
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { useMapStore } from '@/stores/mapStore';

export const Map = () => {
  const { center, zoom, markers } = useMapStore();

  return (
    <MapContainer center={center} zoom={zoom}>
      <TileLayer url="..." />
      {markers.map(m => (
        <Marker key={m.id} position={m.position}>
          <Popup>{m.content}</Popup>
        </Marker>
      ))}
    </MapContainer>
  );
};
```

### Phase 4: 状態管理 + API (3-4日)

Zustand + TanStack Queryで状態管理。

```typescript
// stores/prefsStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PrefsStore {
  spotPeriod: number;
  setSpotPeriod: (period: number) => void;
  // ...
}

export const usePrefsStore = create<PrefsStore>()(
  persist(
    (set) => ({
      spotPeriod: 12,
      setSpotPeriod: (period) => set({ spotPeriod: period }),
    }),
    { name: 'myact-prefs' }
  )
);
```

### Phase 5: UI移行 (5-7日)

Bootstrap 4モーダル等をReactコンポーネントに移行。

### Phase 6: テスト + 旧コード削除 (2-3日)

- Vitest + Testing Libraryでコンポーネントテスト
- MSWでAPIモック
- 旧jQuery/Bootstrap削除

## 並行運用戦略

```
apps/myact/
├── index.html          # 旧: jQuery版（当面維持）
├── index-react.html    # 新: React版（開発用）
├── js/                 # 旧: JSモジュール
├── css/                # 旧: CSS
└── src/                # 新: React + TypeScript
    └── ...
```

Viteで`/react`パスに新版をビルド、段階的に移行。

## 工数見積

| Phase | 期間 | 内容 |
|-------|------|------|
| Phase 1 | 1-2日 | 環境構築 |
| Phase 2 | 2-3日 | 型定義 |
| Phase 3 | 3-5日 | 地図コンポーネント |
| Phase 4 | 3-4日 | 状態管理 + API |
| Phase 5 | 5-7日 | UI移行 |
| Phase 6 | 2-3日 | テスト + 削除 |
| **合計** | **16-24日** | |

## 作成日
2024-12-28
