import { Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import type { LatLngExpression } from 'leaflet';
import { getParkMarkerColor } from '@/types/map';
import { usePrefsStore } from '@/stores';
import type { PotaParkMarker as PotaParkMarkerType } from '@/types';

interface ParkMarkerProps {
  position: LatLngExpression;
  park: PotaParkMarkerType;
  onClick: () => void;
}

// leaflet-extra-markers互換のアイコン作成
function createParkIcon(markerColor: string): L.DivIcon {
  const colorMap: Record<string, string> = {
    'green-light': '#8bc34a',
    green: '#4caf50',
    yellow: '#ffeb3b',
    orange: '#ff9800',
    red: '#f44336',
  };
  const bgColor = colorMap[markerColor] || colorMap.green;

  return L.divIcon({
    className: 'park-marker',
    html: `
      <div class="park-marker-icon" style="background-color: ${bgColor}">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="white">
          <path d="M17,8C8,10 5.9,16.17 3.82,21.34L5.71,22L6.66,19.7C7.14,19.87 7.64,20 8,20C19,20 22,3 22,3C21,5 14,5.25 9,6.25C4,7.25 2,11.5 2,13.5C2,15.5 3.75,17.25 3.75,17.25C7,8 17,8 17,8Z"/>
        </svg>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function selectRef(
  park: PotaParkMarkerType,
  showName: boolean
): string {
  const parts: string[] = [];
  if (park.pota) parts.push(park.pota.replace('JA-', 'JP-'));
  if (park.wwff) parts.push(park.wwff);
  if (showName && park.nameJ) parts.push(park.nameJ);
  return parts.join(' / ');
}

export function ParkMarker({ position, park, onClick }: ParkMarkerProps) {
  const showPotaActLog = usePrefsStore((s) => s.show_potaactlog);
  const popupPermanent = usePrefsStore((s) => s.popup_permanent);

  const markerColor = getParkMarkerColor(park, showPotaActLog);
  const icon = createParkIcon(markerColor);
  const label = selectRef(park, false);

  return (
    <Marker
      position={position}
      icon={icon}
      eventHandlers={{
        click: () => onClick(),
      }}
    >
      <Tooltip
        permanent={popupPermanent}
        direction="center"
        offset={[0, 20]}
      >
        {label}
      </Tooltip>
    </Marker>
  );
}
