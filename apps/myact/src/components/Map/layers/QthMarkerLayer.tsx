import { useRef } from 'react';
import { Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useMapStore } from '@/stores';

// QTHマーカー用のカスタムアイコン（黄色の円形、ユーザーアイコン）
const qthIcon = L.divIcon({
  className: 'qth-marker-icon',
  html: `
    <div style="
      width: 32px;
      height: 32px;
      background: #fbbf24;
      border: 3px solid #b45309;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    ">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="#78350f">
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
      </svg>
    </div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

export function QthMarkerLayer() {
  const map = useMap();
  const qthPosition = useMapStore((s) => s.qthPosition);
  const setQthPosition = useMapStore((s) => s.setQthPosition);
  const markerRef = useRef<L.Marker>(null);

  // ドラッグ終了時のハンドラ
  const handleDragEnd = () => {
    const marker = markerRef.current;
    if (marker) {
      const latlng = marker.getLatLng();
      setQthPosition({ lat: latlng.lat, lng: latlng.lng });
      map.setView(latlng, map.getZoom());
    }
  };

  if (!qthPosition) {
    return null;
  }

  return (
    <Marker
      ref={markerRef}
      position={[qthPosition.lat, qthPosition.lng]}
      icon={qthIcon}
      draggable={true}
      eventHandlers={{
        dragend: handleDragEnd,
      }}
    >
      <Popup>
        <div>
          <strong>現在地</strong>
          <br />
          {qthPosition.lat.toFixed(6)}, {qthPosition.lng.toFixed(6)}
        </div>
      </Popup>
    </Marker>
  );
}
