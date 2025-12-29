# JavaScript リファクタリング進行状況

## 概要

myact の index.html からインラインCSS/JSを外部ファイルに抽出し、JSをモジュール分割した。

## 完了済み作業 (2024-12-28)

### CSS抽出
- `apps/myact/css/myact.css` 作成（113行）
- インラインスタイルを外部ファイルに移動
- index.htmlからstyleタグ削除

### JS抽出・モジュール分割
インラインJS（約1760行）を12モジュールに分割:

| ファイル | 行数 | 機能 |
|---------|------|------|
| config.js | 79 | グローバル設定、prefs、実験的機能検出 |
| api.js | 26 | fetchAPI関数 |
| utils.js | 117 | ユーティリティ（toWestLon, escapeStr, clock等） |
| map-init.js | 123 | Leaflet地図初期化、タイルレイヤー、TopoJSON |
| pota-log.js | 153 | POTAログ管理（アップロード、チェック、エクスポート） |
| keyer.js | 140 | シリアル/WiFiキーヤー通信 |
| popup.js | 197 | 地図ポップアップ表示ロジック |
| markers.js | 273 | 山頂/公園/寺院マーカー配置 |
| geolocation.js | 102 | GPS位置取得（許可確認付き） |
| prefs.js | 106 | Cookie設定読み書き |
| spots.js | 281 | スポットチャート（Chart.js） |
| aprs.js | 100 | APRSトラック表示 |
| main.js | 68 | 初期化・イベントバインド |

### index.html削減
- **Before**: 2205行
- **After**: 455行
- **削減率**: 80%

## 現在の課題

1. **グローバル変数** - prefs, map, markersなどがwindowスコープ
2. **ES Modules未使用** - scriptタグで読み込み順序管理
3. **ライブラリ旧版** - Bootstrap 4.5.3, jQuery 3.5.1
4. **CDN依存** - 全ライブラリがCDNから読み込み
5. **ビルドプロセスなし** - そのまま配信
6. **TypeScriptなし** - 型安全性なし
7. **テストなし** - 手動テストのみ

## 次のステップ

React + TypeScript移行を実施。詳細は [react-migration-plan.md](./react-migration-plan.md) 参照。

## 作成日
2024-12-28
