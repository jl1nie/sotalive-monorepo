# MyACT React移行 設計議論メモ (2024-12-29)

## 機能一覧

詳細は `apps/myact/FEATURES.md` を参照。

### 必須機能（全て移行対象）
1. 地図表示（Leaflet + 地理院タイル）
2. マーカー表示（SOTA/POTA/JAFF/現在地/APRS）
3. **領域表示**
   - POTA/JAFF公園領域（TopoJSON） ← 現役機能、必須
   - SOTAアクティベーションゾーン ← 現役機能、必須
4. ポップアップ（位置情報、JCC/JCG、標高、GL等）
5. リファレンス検索
6. スポット表示
7. POTAログ管理
8. APRSトラック
9. 現在地取得（GPS）
10. パドルエミュレータ（CWキーヤー）
11. 設定（Cookie永続化）
12. ヘッダー（時計、地磁気指数）
13. 逆ジオコーダー

### 削除候補
- Ham Fair特別マーカー（イベント終了）

### 保留機能
- 観音霊場（API未実装だが機能は残す）

---

## UI/UX改善

### スポット表示の改善

**現状**: モーダル内にChart.jsで時系列チャート

**改善案**:
- **スポットリスト（サイドバー）**: 
  - 指定期間内の全スポットを時系列（新しい順）
  - 仮想スクロール（react-window）で全件表示
  - カードタップで地図移動
- **チャート（ボトムシート/モーダル）**:
  - 横軸=時間のため横幅確保が必要
  - デスクトップ: ボトムシート
  - モバイル: フルスクリーンモーダル

### レイアウト

```
デスクトップ:
┌─────────────────────────────────────────────────┐
│ [ヘッダー]                                       │
├─────────────────────────────────────────────────┤
│                                 │ スポット     │
│         地図                    │ (リスト)     │
│                                 │              │
├─────────────────────────────────┴──────────────┤
│ [チャート] (ボトムシート、横幅フル)              │
└─────────────────────────────────────────────────┘
```

---

## React SPA化の課題

### 1. Leaflet統合
- 地図インスタンス: `useMap()`フック
- イベント: `useMapEvents()`
- カスタムレイヤー: 既存クラス併用可

### 2. グローバル変数 → 状態管理
- `prefs` → Zustand + persist
- マーカー配列 → useRef or state
- Chart.jsインスタンス → useRef

### 3. DOM直接操作 → controlled component
- `document.getElementById()` → state/props
- `el.checked = true` → controlled input

### 4. jQuery依存 → React UIライブラリ
- Bootstrap Modal → Headless UI / Radix UI
- bootstrap-slider → React Slider

### 5. ポップアップHTML → Reactコンポーネント
- 文字列連結 → `ReactDOMServer.renderToString()`

### 6. 設定変更の副作用連鎖
- `closePrefs()` の6関数連鎖 → Zustand subscribe / useEffect

---

## 領域表示の実装詳細

### POTA/JAFF公園領域（TopoJSON）
- `L.TopoJSON.extend()` でGeoJSONに変換
- `onEachFeature` でクリックハンドラ設定（地図クリックとは別）
- 領域クリック → feature.propertiesからPOTA/JAFF/名前取得

### SOTAアクティベーションゾーン

#### 処理フロー
```
1. 山頂座標 → タイル座標 + ピクセル座標に変換
2. 地理院DEMタイル(PNG)取得 → Canvas描画 → 標高配列
3. 各ピクセルの標高差を計算、閾値でアルファ値マーキング
   - opaque1 (0x01): 山頂-25m 〜 山頂-20m → 赤
   - opaque2 (0x02): 山頂-20m 〜 山頂 → 青
4. 山頂ピクセルから4方向フラッドフィル
5. タイル境界跨ぎ → pixel_stackに保存、隣接タイルで継続
```

#### クラス構成
- `getDEM()`: 地理院DEMタイル取得、標高配列生成
- `ContourLayer (L.GridLayer.extend)`: カスタムタイルレイヤー
- `RegionFill2`: タイル跨ぎ対応フラッドフィルアルゴリズム

#### React対応
- 全てCanvas操作で完結、Reactと独立
- `useEffect`でレイヤーのマウント/アンマウント管理するだけ
- 既存コードをそのまま流用可能

---

## 状態管理設計

```typescript
// stores/prefsStore.ts - 永続化
interface PrefsStore {
  sotaRef: boolean;
  potaRef: boolean;
  jaffRef: boolean;
  aprsTrack: boolean;
  zoomThreshold: number;
  spotPeriod: number;
  // ...
}

// stores/mapStore.ts - 地図状態
interface MapStore {
  center: [number, number];
  zoom: number;
  activePopup: PopupData | null;
}

// stores/spotsStore.ts - スポットデータ
interface SpotsStore {
  spots: Spot[];
  period: number;
  program: 'SOTA' | 'POTA' | 'ALL';
}

// stores/logStore.ts - POTAログ
interface LogStore {
  activatorUuid: string | null;
  hunterUuid: string | null;
}
```

---

## 実装完了済み (Phase 1-7)

### Phase 1-3: 環境設定・型定義・API・レイアウト ✅
- vite.config.ts (パスalias, プロキシ設定)
- tsconfig.app.json (パスalias)
- 静的アセット (img, font, json, favicon)
- types/api.ts, preferences.ts, map.ts
- stores/prefsStore.ts, mapStore.ts, spotsStore.ts
- api/client.ts (APIクライアント)
- hooks/useSpots.ts (TanStack Query)
- Header, SpotList, SpotCard, Layout

### Phase 4: 地図マーカー・ポリゴン・ポップアップ ✅
- MarkersLayer (SOTA/POTA/JAFFマーカー)
- SummitMarker, ParkMarker
- ParkPolygonLayer (TopoJSONポリゴン)
- MapPopup (詳細表示)

### Phase 5: Activation Zone + APRSトラック ✅
- ActivationZoneLayer (SOTAサミット用AZ表示)
- AprsTrackLayer (APRSトラック表示)

### Phase 6: 設定モーダル・検索入力 ✅
- SearchInput (オートコンプリート付き検索)
- useSearch hook
- SettingsModal (全設定項目対応)

### Phase 7: Geolocation機能 ✅
- useGeolocation hook
- QTHボタンで現在地取得→地図移動

---

## 残作業

### 優先度高
1. **パドルエミュレータ (Keyer)**
   - WebSerial API / WebSocket接続
   - CWメッセージ送信機能
   - 設定項目は既にSettingsModalに含まれる予定

### 優先度中
2. **POTAログ管理UI**
   - ログアップロード/ダウンロード
   - ログ共有機能
   - API client既存

3. **スポットチャート**
   - Chart.js統合 or recharts
   - 時系列表示（ボトムシート/モーダル）

### 優先度低
4. **E2Eテスト追加**
   - Vitest + Testing Library
   - 主要フロー検証

5. **旧コード削除**
   - jQuery/Bootstrap依存完全除去
   - レガシーjs/cssファイル削除

---

## 技術的メモ

### react-window v2 API変更点
```typescript
// v1 (FixedSizeList)
<FixedSizeList>
  {({ index, style }) => <Item />}
</FixedSizeList>

// v2 (List with rowComponent)
<List
  rowComponent={SpotRow}
  rowProps={{ spots, onSpotClick }}
/>

function SpotRow({ index, style, spots, onSpotClick }: RowComponentProps<Props>) {
  // ...
}
```

### TopoJSON型問題
- `topojson-specification`モジュールが見つからない問題
- 解決: ローカルインターフェース定義で対応

### L.GridLayerカスタム拡張
- ActivationZone用にContourLayerクラス作成
- getDEM()でGSI DEMタイル取得
- Canvas直接操作でReactと独立