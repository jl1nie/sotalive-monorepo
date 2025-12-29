import { useEffect, useRef } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import { useMapStore } from '@/stores';

export function MapEventHandler() {
  const map = useMap();
  const setView = useMapStore((s) => s.setView);
  const setActivePopup = useMapStore((s) => s.setActivePopup);
  const center = useMapStore((s) => s.center);
  const zoom = useMapStore((s) => s.zoom);

  // 外部からの変更かどうかを追跡（moveendイベントからの更新を無視するため）
  const isExternalUpdate = useRef(false);
  const lastCenter = useRef(center);
  const lastZoom = useRef(zoom);

  // ストアの変更をマップに反映
  useEffect(() => {
    // 同じ値なら何もしない
    const centerArray = Array.isArray(center) ? center : [center.lat, center.lng];
    const lastCenterArray = Array.isArray(lastCenter.current)
      ? lastCenter.current
      : [lastCenter.current.lat, lastCenter.current.lng];

    const centerChanged =
      centerArray[0] !== lastCenterArray[0] ||
      centerArray[1] !== lastCenterArray[1];
    const zoomChanged = zoom !== lastZoom.current;

    if (centerChanged || zoomChanged) {
      isExternalUpdate.current = true;
      map.setView(centerArray as [number, number], zoom);
      lastCenter.current = center;
      lastZoom.current = zoom;
    }
  }, [center, zoom, map]);

  useMapEvents({
    click: (e) => {
      const { lat, lng } = e.latlng;
      setActivePopup({
        latlng: { lat, lng },
        area: {},
        isMarker: false,
        isGPS: false,
      });
    },
    moveend: (e) => {
      // 外部からの更新（setView経由）の場合はストアを更新しない
      if (isExternalUpdate.current) {
        isExternalUpdate.current = false;
        return;
      }
      const mapInstance = e.target;
      const newCenter = mapInstance.getCenter();
      const newZoom = mapInstance.getZoom();
      lastCenter.current = [newCenter.lat, newCenter.lng];
      lastZoom.current = newZoom;
      setView([newCenter.lat, newCenter.lng], newZoom);
    },
  });

  return null;
}
