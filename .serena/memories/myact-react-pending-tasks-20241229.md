# myact React移行 - 未完了タスク (2024-12-29)

## 残タスク一覧

### 1. 地図クリック時のポップアップ実装（優先度: 高）

**現状の問題:**
- `MapEventHandler.tsx`: 地図クリック時に `setActivePopup` を呼んでいる
- `MapPopup.tsx`: `markerPopup` のみ監視（`activePopup` を使っていない）
- 結論: **地図クリック時のポップアップ表示コンポーネントが存在しない**

**従来の実装 (apps/myact-org/js/):**
```javascript
// main.js:16-18
map.on('click', function (e) {
  displayPopup({}, e.latlng, false, false);
});

// popup.js - displayPopup関数
// 地図クリック → SOTAサミット検索 → 逆ジオコーダー → ポップアップ表示
// isMarker=false, isGPS=false の場合は座標ベースでサミット検索
```

**必要な実装:**
1. `ClickPopup.tsx` 新規作成 - 地図クリック時のポップアップ
   - `activePopup` を監視
   - 座標から逆ジオコーダー呼び出し
   - SOTAサミット検索（dist=200m）
   - JCC/JCG/GL/標高/天気リンク表示

2. `QthMarkerLayer.tsx` 改善
   - ドラッグ終了時に `displayPopup` 相当の情報表示
   - 現在は座標のみ表示している

**関連ファイル:**
- `apps/myact/src/components/Map/MapEventHandler.tsx` - click → setActivePopup
- `apps/myact/src/components/Map/popup/MapPopup.tsx` - markerPopupのみ監視
- `apps/myact/src/stores/mapStore.ts` - activePopup と markerPopup が別々
- `apps/myact-org/js/popup.js` - 従来の displayPopup 実装

### 2. チャートの React error #284（優先度: 高）

**エラー内容:**
```
Uncaught Error: Minified React error #284
"Rendered more hooks than during the previous render"
```

**前回の修正:**
- `SpotChart.tsx` の lazy() 内でインライン関数コンポーネントを作成していた
- `ScatterChartContent.tsx` に分離して修正した

**現状:**
- ユーザー報告では依然としてエラーが発生している
- 再調査が必要

**関連ファイル:**
- `apps/myact/src/components/Spots/Chart/SpotChart.tsx`
- `apps/myact/src/components/Spots/Chart/ScatterChartContent.tsx`

## 今回のセッションで完了した項目

1. ✅ MapEventHandler - ストア→Leafletマップ同期
2. ✅ revgeocode.ts - sotaapp2 JCC/JCG APIに移行
3. ✅ useGeolocation - autoFetchIfGranted 実装
4. ✅ QthMarkerLayer - 黄色ドラッグ可能マーカー作成
5. ✅ Layout.tsx - 位置取得後にQTHマーカー設置

## ストア構造メモ

```typescript
// mapStore.ts
interface MapStore {
  activePopup: PopupData | null;    // 地図クリック用（未使用）
  markerPopup: MarkerPopupData | null;  // マーカークリック用（使用中）
  qthPosition: { lat: number; lng: number } | null;  // QTHマーカー位置
  // ...
}
```

## 次回の作業手順

1. `activePopup` と `markerPopup` の統合を検討
2. `ClickPopup.tsx` を作成して地図クリック時のポップアップ表示
3. QthMarkerLayerのポップアップを従来と同じ内容に改善
4. チャートエラーの再調査・修正
