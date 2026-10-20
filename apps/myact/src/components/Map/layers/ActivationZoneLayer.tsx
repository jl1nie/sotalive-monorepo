import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { useMapStore } from '@/stores';

// 座標変換ユーティリティ
function latlonToPxl(lat: number, lon: number, zoom: number) {
  const Lmax = 85.05112878;
  const px = Math.floor(Math.pow(2, zoom + 7) * (lon / 180 + 1));
  const tx = Math.floor(px / 256);
  const py = Math.floor(
    (Math.pow(2, zoom + 7) / Math.PI) *
      (-1 * Math.atanh(Math.sin((Math.PI / 180) * lat)) +
        Math.atanh(Math.sin((Math.PI / 180) * Lmax)))
  );
  const ty = Math.floor(py / 256);
  return { px, tx, py, ty };
}

// DEM (Digital Elevation Model) 取得
async function getDEM(
  coords: { x: number; y: number; z: number }
): Promise<number[]> {
  const { x, y, z } = coords;
  const url = `https://cyberjapandata.gsi.go.jp/xyz/dem/${z}/${x}/${y}.txt`;

  try {
    const response = await fetch(url);
    const text = await response.text();
    const lines = text.trim().split('\n');
    const dem: number[] = [];

    for (const line of lines) {
      const values = line.split(',');
      for (const val of values) {
        if (val === 'e') {
          dem.push(-9999);
        } else {
          dem.push(parseFloat(val));
        }
      }
    }
    return dem;
  } catch {
    return new Array(256 * 256).fill(-9999);
  }
}

// 標高取得 API
async function getElevation(lat: number, lon: number): Promise<number | null> {
  try {
    const response = await fetch(
      `/api/v2/revgeocode?lat=${lat}&lon=${lon}&elev=true`
    );
    const data = await response.json();
    if (data.errors === 'OK' && data.elevation !== undefined) {
      return data.elevation;
    }
    return null;
  } catch {
    return null;
  }
}

// カスタムContourLayerクラス
class ContourLayer extends L.GridLayer {
  private _elevation: number;
  private _tX: number;
  private _tY: number;
  private _upperlimit: number;
  private _vdist: number;
  private _hdist: number;
  private _zoom: number;

  constructor(
    pxl: { px: number; tx: number; py: number; ty: number },
    zoom: number,
    elevation: number,
    uplmt: number,
    vdist: number,
    hdist: number,
    options?: L.GridLayerOptions
  ) {
    super(options);
    this._elevation = elevation;
    this._tX = pxl.tx;
    this._tY = pxl.ty;
    this._upperlimit = uplmt;
    this._vdist = vdist;
    this._hdist = hdist;
    this._zoom = zoom;
  }

  createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;

    const tX = this._tX;
    const tY = this._tY;
    const hdist = this._hdist;
    const elev = this._elevation;
    const vdist = this._vdist;
    const uplmt = this._upperlimit;

    // 距離チェック
    if (Math.abs(coords.x - tX) > hdist || Math.abs(coords.y - tY) > hdist) {
      setTimeout(() => done(undefined, canvas), 0);
      return canvas;
    }

    getDEM({ x: coords.x, y: coords.y, z: this._zoom }).then((e) => {
      const dem = e.map((a) => (elev - a) / vdist);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        done(undefined, canvas);
        return;
      }

      const img = ctx.createImageData(256, 256);

      for (let i = 0; i <= 0xffff; i++) {
        if (dem[i] < 1) {
          if (dem[i] < uplmt) {
            // 青色 (AZ外だが近い)
            img.data[i * 4 + 0] = 0x00;
            img.data[i * 4 + 1] = 0x00;
            img.data[i * 4 + 2] = 0xff;
            img.data[i * 4 + 3] = 0x60;
          } else {
            // 赤色 (AZ内)
            img.data[i * 4 + 0] = 0xff;
            img.data[i * 4 + 1] = 0x00;
            img.data[i * 4 + 2] = 0x00;
            img.data[i * 4 + 3] = 0x60;
          }
        }
      }

      ctx.putImageData(img, 0, 0);
      done(undefined, canvas);
    });

    return canvas;
  }
}

export function ActivationZoneLayer() {
  const map = useMap();
  const layerRef = useRef<ContourLayer | null>(null);
  const markerPopup = useMapStore((s) => s.markerPopup);

  useEffect(() => {
    if (!markerPopup || markerPopup.type !== 'summit') {
      // サミット以外またはポップアップなしの場合はAZを削除
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
      return;
    }

    const [lat, lon] = markerPopup.position;
    let zoom = map.getZoom();
    if (zoom > 14) zoom = 14;

    const uplmt = -0.8;
    const vdist = 25;
    const hdist = 8;

    async function displayAZ() {
      const elevation = await getElevation(lat, lon);
      if (elevation === null) return;

      const pxl = latlonToPxl(lat, lon, zoom);

      // ピーク探索
      const dem = await getDEM({ x: pxl.tx, y: pxl.ty, z: zoom });
      const px = pxl.px % 256;
      const py = pxl.py % 256;
      let peak = 0;
      let cx = px;
      let cy = py;

      for (let i = -3; i < 4; i++) {
        for (let j = -3; j < 4; j++) {
          const pos = (py + j) * 256 + px + i;
          if (pos >= 0 && pos <= 65535) {
            if (dem[pos] > peak) {
              cx = px + i;
              cy = py + j;
              peak = dem[pos];
            }
          }
        }
      }

      const adjustedPxl = {
        px: pxl.tx * 256 + cx,
        py: pxl.ty * 256 + cy,
        tx: pxl.tx,
        ty: pxl.ty,
      };

      // 既存レイヤー削除
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
      }

      // 新しいレイヤー作成
      const layer = new ContourLayer(adjustedPxl, zoom, peak, uplmt, vdist, hdist, {
        attribution:
          "<a href='https://little-ctc.com/sota_hp/' target='_blank'>JCC/JCGデータ</a>",
        minZoom: 14,
        maxZoom: 18,
        // maxNativeZoom: 14,
      });

      layer.addTo(map);
      layerRef.current = layer;
    }

    displayAZ();

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [markerPopup, map]);

  return null;
}
