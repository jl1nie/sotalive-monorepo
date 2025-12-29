# MyACT 機能一覧

## 概要
MyACTはSOTA/POTAアマチュア無線アワード活動を支援する地図ベースWebアプリ。

---

## 1. 地図機能（Map）

### 1.1 地図表示
- **地図ライブラリ**: Leaflet
- **タイルソース**: 地理院タイル（国土地理院）
- **初期位置**: 日本中心（37.514444, 137.712222）またはCookie保存位置
- **ズーム制御**: ズームレベル表示

### 1.2 マーカー表示
| マーカー種別 | 形状 | 表示条件 |
|------------|------|----------|
| SOTAサミット | 丸（標高で色分け） | ズームレベル・標高でフィルタ |
| POTA/JAFF公園 | 四角アイコン（ツリー） | ズームレベル・面積でフィルタ |
| 現在地 | 丸アイコン（ユーザー） | GPS取得後 |
| APRSトラック | 星アイコン | APRS有効時 |

### 1.3 領域表示

#### 1.3.1 POTA/JAFF公園領域（TopoJSON）
- **データ**: jaffpota-annotated-v22.json（TopoJSON形式）
- **表示**: ポリゴン塗りつぶし（青系、透過）
- **クリック動作**: 領域クリックで専用ポップアップ（feature.propertiesから取得）
  - 通常クリック: POTA/JAFF/公園名を表示
  - 右クリック: PID/UID等の詳細情報も表示
- **注意**: 地図クリックとは別のイベントハンドラ（`onEachFeature`）

#### 1.3.2 SOTAアクティベーションゾーン
- **計算方法**: DEMデータから山頂標高-25m以内の領域を塗りつぶし
- **描画**: Leaflet GridLayerによるカスタムタイルレイヤー
- **色分け**: 赤（AZ内）/ 青（AZ外だが近傍）
- **トリガー**: サミットポップアップ表示時に自動描画

### 1.4 ポップアップ情報
クリック位置に以下を表示:
- **位置情報**: 緯度/経度、グリッドロケーター（GL）
- **JCC/JCG**: 市区町村コード
- **標高**: 標高データ（地理院DEM）
- **天気リンク**: Windy.comへのリンク
- **MAPCODE**: オプション表示
- **SOTA情報**: サミットコード、ポイント、アクティベーション回数
- **POTA情報**: 公園コード、QSO数（ログ有効時）

---

## 2. 検索機能（Search）

### 2.1 リファレンス検索
- サミット名、公園名、リファレンスコードで検索
- 検索結果をクリックで地図移動・ポップアップ表示

---

## 3. スポット表示（Spots）

### 3.1 スポットチャート（モーダル）
- **表示形式**: 時系列チャート（Chart.js）
- **対象プログラム**: SOTA/POTA切替可
- **表示期間**: 1〜24時間（選択可）
- **グループ化**: リファレンス別/コールサイン別
- **連動機能**: チャートホバーで地図移動

### 3.2 ログ統計
- アップロードログ数・総エントリ数の推移グラフ

---

## 4. POTAログ管理（POTA Log）

### 4.1 ログアップロード
- POTA.appからダウンロードしたCSVをアップロード
- Activatorログ/Hunterログを区別して管理

### 4.2 ログ表示連携
- ログ有効時、地図上のマーカー色で運用/未運用を区別
- ポップアップにQSO数表示

### 4.3 ログ共有
- Export: 共有キー発行
- Import: 共有キーでログ取得

---

## 5. APRS連携（APRS）

### 5.1 APRSトラック表示
- SOTAアクティベーターのAPRS移動軌跡を地図上に表示
- 24時間以内のトラックを取得
- SSID別アイコン（徒歩/車/ホーム）

---

## 6. 現在地取得（Geolocation）

### 6.1 GPS位置取得
- ボタンクリックでGPS取得
- 取得位置にマーカー表示
- 許可済みなら起動時自動取得

### 6.2 QTHマーカー
- ドラッグ移動可能
- 移動後に再度ポップアップ表示

---

## 7. パドルエミュレータ（Keyer）

### 7.1 CWメッセージ送信
- プリセットメッセージ4つ
- 変数置換: $CALL, $SOTA, $POTA, $JAFF, $JCC, $JCG

### 7.2 接続方式
- **WiFi**: ESP32デバイス（actpaddle.local）へHTTP POST
- **シリアル**: Web Serial API経由

### 7.3 パラメータ
- WPM（速度）
- パドル/ストレート選択
- リバースパドル

---

## 8. 設定（Preferences）

### 8.1 表示対象
| 設定 | 説明 | デフォルト |
|------|------|-----------|
| sota_ref | SOTAサミット表示 | ON |
| pota_ref | POTA公園表示 | ON |
| jaff_ref | JAFF公園表示 | ON |
| aprs_track | APRSトラック表示 | ON |

### 8.2 マーカー設定
| 設定 | 説明 | デフォルト |
|------|------|-----------|
| zoom_threshold | マーカー表示閾値（7-12） | 12 |
| popup_permanent | ラベル常時表示 | ON |
| link_googlemap | Google Mapリンク | OFF |
| display_mapcode | MAPCODE表示 | OFF |

### 8.3 パドルエミュレータ設定
- コールサイン、エリアコード
- メッセージテンプレート4つ
- WiFi/シリアル選択、ホスト名

### 8.4 保存
- Cookie保存（js.cookie）

---

## 9. ヘッダー表示

### 9.1 時計
- 現在時刻（ローカル）

### 9.2 地磁気指数
- K指数、A指数（30分毎更新）

---

## 10. 外部連携

### 10.1 リンク生成
- 地理院地図
- Google Maps
- Windy.com（天気）
- SOTA Summits
- POTA.app
- WWFF

### 10.2 API連携（sotaapp2）
| エンドポイント | 用途 |
|--------------|------|
| /api/v2/search | リファレンス検索 |
| /api/v2/sota/summits/search | サミット情報取得 |
| /api/v2/pota/parks/search | 公園情報取得 |
| /api/v2/activation/spots | スポット取得 |
| /api/v2/activation/aprs/track | APRSトラック取得 |
| /api/v2/pota/log/* | ログ管理 |
| /api/v2/propagation/geomag | 地磁気指数取得 |

---

## 11. 逆ジオコーダー

### 11.1 位置情報取得
- 緯度/経度からJCC/JCG、都道府県、市区町村名を取得
- 標高データ取得（地理院DEM）
- グリッドロケーター計算

---

## React移行時の検討事項

### 削除候補（イベント終了）
1. **Ham Fair特別マーカー** - イベント終了、削除可

### 実装上の注意点
1. **領域クリック**: TopoJSONレイヤーは`onEachFeature`でクリックハンドラ設定。地図クリックとは別処理
2. **アクティベーションゾーン**: DEMデータ取得 + Canvas描画の複雑な処理。react-leaflet用にカスタムレイヤー化が必要

### UI/UX改善候補
1. **設定画面**: モーダル → サイドパネルまたはドロワー
2. **スポットチャート**: モーダル → サイドパネル（地図と同時表示）
3. **検索**: インクリメンタルサーチ + ドロップダウン
4. **レスポンシブ**: モバイル最適化

### スポット表示の改善案

現状: モーダル内にChart.jsで時系列チャート表示

**改善案: スポットリスト（サイドバー）+ チャート（ボトムシート）**

#### スポットリスト（サイドバー）
- 指定期間内の全スポットを時系列（新しい順）で表示
- 仮想スクロール（react-window）でパフォーマンス確保
- カードタップで地図移動
- 表示内容:
  - コールサイン
  - リファレンス + 公園/山名
  - 周波数、モード、時刻
  - コメント（展開時）

```
┌────────────────┐
│ JA1XXX/1       │
│ JP-1234 ○○公園 │
│ 7.032 CW  10:32│
└────────────────┘
```

#### チャート（ボトムシート/モーダル）
- 横軸=時間のため横幅確保が必要
- デスクトップ: ボトムシート（高さ可変）
- モバイル: フルスクリーンモーダル
- 現状のChart.js表示を維持

---

## React SPA化の課題

### 1. Leaflet統合
| 課題 | 現状 | React対応 |
|------|------|-----------|
| 地図インスタンス | グローバル変数`map` | `useMap()`フック、Context |
| イベントハンドラ | `map.on('click', ...)` | `useMapEvents()`フック |
| カスタムレイヤー | `L.GridLayer.extend()` | カスタムフック or 従来クラス併用 |
| TopoJSONレイヤー | `L.TopoJSON.extend()` | `react-leaflet`用ラッパー必要 |
| AZレイヤー再描画 | `map.removeLayer()` → `addTo()` | 状態管理でレイヤー制御 |

### 2. 状態の分散・グローバル変数
| 現状の変数 | 用途 | React対応 |
|-----------|------|-----------|
| `prefs` | 設定（Cookie連携） | Zustand + persist middleware |
| `show_summit_marker[]` | マーカー参照保持 | `useRef` or state |
| `qth_marker` | 現在地マーカー | state |
| `activation_zone` | AZレイヤー参照 | state or ref |
| `aprs_layer` | APRSレイヤー参照 | state or ref |
| `chart`, `chart2` | Chart.jsインスタンス | `useRef` |
| `serial_port`, `serial_writer` | WebSerial | `useRef` + カスタムフック |

### 3. DOM直接操作
| 現状 | 問題点 | React対応 |
|------|--------|-----------|
| `document.getElementById()` | Reactの仮想DOMと競合 | state/props経由 |
| `el.checked = true` | 制御コンポーネントでない | controlled component |
| `el.innerText = ...` | 直接DOM更新 | state更新 → 再レンダリング |
| `popup.setContent(html)` | HTML文字列注入 | Reactコンポーネント or `ReactDOMServer.renderToString()` |

### 4. jQuery依存
| 機能 | 現状 | React対応 |
|------|------|-----------|
| モーダル表示 | Bootstrap Modal (`$('#modal').modal()`) | Headless UI / Radix UI |
| スライダー | bootstrap-slider | React Slider コンポーネント |
| イベント | `$('#el').on('show.bs.modal')` | React useEffect / イベントハンドラ |
| Cookie | js.cookie | zustand persist or js-cookie直接 |

### 5. ポップアップのHTML生成
```javascript
// 現状: 文字列連結でHTML生成
cnt = '<b>' + selectRef(area, true) + '</b>' + mesg + weather;
popup.setContent(cnt);
```
**問題**: XSSリスク、可読性低下、Reactの利点を活かせない

**対応案**:
- `ReactDOMServer.renderToString(<PopupContent {...props} />)`
- または `createRoot` で Leaflet popup に React マウント

### 6. 非同期処理の連鎖
```javascript
// 現状: fetch().then().then() のネスト
fetch(url).then(res => res.json()).then(res => {
  local_reverse_geocoder(...).then(res => {
    get_mapcode(...).then(code => {
      // ポップアップ更新
    });
  });
});
```
**対応**: TanStack Query + async/await でフラット化

### 7. 設定変更時の副作用
```javascript
// closePrefs() で複数の関数を連鎖呼び出し
function closePrefs() {
  clickPrefs();      // Cookie保存
  redrawPopup();     // ポップアップ再描画
  redrawMarkers();   // マーカー再描画
  refresh_spots();   // スポット再取得
  refresh_aprs_track(); // APRS再取得
  updateGeoJson();   // TopoJSON再読込
}
```
**対応**: Zustand の subscribe / useEffect で状態変更を監視

### 8. Web API（シリアル）
```javascript
// Web Serial API はブラウザ互換性に注意
navigator.serial.requestPort({ filters });
```
**対応**: カスタムフック `useSerialPort()` でラップ、フォールバック処理

---

## 状態管理設計

### Zustand Store分割
```typescript
// stores/prefsStore.ts - 永続化
interface PrefsStore {
  sotaRef: boolean;
  potaRef: boolean;
  // ...
  setPrefs: (key, value) => void;
}

// stores/mapStore.ts - 地図状態
interface MapStore {
  center: [number, number];
  zoom: number;
  markers: Marker[];
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

### TanStack Query
```typescript
// hooks/useSpots.ts
const useSpots = (period: number, program: string) => {
  return useQuery({
    queryKey: ['spots', period, program],
    queryFn: () => fetchSpots(period, program),
    refetchInterval: 60000, // 1分ごと自動更新
  });
};
```
