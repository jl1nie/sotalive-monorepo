// Map Related Types

import type { LatLngExpression } from 'leaflet';

/** 地図の初期設定 */
export const MAP_DEFAULTS = {
  center: [37.514444, 137.712222] as LatLngExpression,
  zoom: 6,
  minZoom: 5,
  maxZoom: 18,
} as const;

/** タイルレイヤー設定 */
export interface TileLayerConfig {
  url: string;
  attribution: string;
  maxZoom: number;
  maxNativeZoom: number;
}

export const TILE_LAYERS: Record<string, TileLayerConfig> = {
  gsi: {
    url: 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png',
    attribution: "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank'>地理院タイル</a>",
    maxZoom: 18,
    maxNativeZoom: 18,
  },
  gsi_photo: {
    url: 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg',
    attribution: "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank'>地理院タイル</a>",
    maxZoom: 18,
    maxNativeZoom: 18,
  },
  osm: {
    url: 'https://tile.thunderforest.com/outdoors/{z}/{x}/{y}.png?apikey=767750c193e54ceeb3aee08d880bdb90',
    attribution: "<a href='https://www.thunderforest.com/'>Thunderforest</a>",
    maxZoom: 18,
    maxNativeZoom: 18,
  },
} as const;

/** ポップアップに表示するエリア情報 */
export interface AreaInfo {
  pota?: string;
  jaff?: string;
  sota?: string;
  sota_code?: string;
  name?: string;
  century?: string;
  areacode?: string;
  temple?: string;
}

/** ポップアップデータ */
export interface PopupData {
  latlng: { lat: number; lng: number; alt?: number };
  area: AreaInfo;
  isMarker: boolean;
  isGPS: boolean;
}

/** SOTAマーカーの色（標高別） */
export function getSummitMarkerColor(elevation: number): string {
  if (elevation > 1500) return '#c62828';
  if (elevation > 1100) return '#ef6c00';
  if (elevation > 850) return '#f9a825';
  if (elevation > 650) return '#9e9d24';
  if (elevation > 500) return '#558b2f';
  return '#1b5e20';
}

/** POTAマーカーの色（状態別） */
export type PotaMarkerColor = 'red' | 'yellow' | 'orange' | 'green-light';

export function getParkMarkerColor(
  park: { date?: string; locid: string[]; act?: number },
  showActLog: boolean
): PotaMarkerColor {
  if (park.date != null) {
    if (park.locid.length === 1) {
      return !showActLog || (park.act ?? 0) > 0 ? 'red' : 'yellow';
    }
    return 'orange';
  }
  return 'green-light';
}
