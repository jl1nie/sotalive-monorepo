import { CircleMarker, Tooltip } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import { getSummitMarkerColor } from '@/types/map';

interface SummitMarkerProps {
  position: LatLngExpression;
  elevation: number;
  activityCount: number;
  zoom: number;
  onClick: () => void;
}

function getMarkerRadius(zoom: number): number {
  if (zoom > 14) return 10;
  if (zoom > 12) return 8;
  if (zoom > 10) return 6;
  return 4;
}

export function SummitMarker({
  position,
  elevation,
  activityCount,
  zoom,
  onClick,
}: SummitMarkerProps) {
  const radius = getMarkerRadius(zoom);
  const fillColor = getSummitMarkerColor(elevation);
  const borderColor = '#4e342e';

  return (
    <CircleMarker
      center={position}
      radius={radius}
      pathOptions={{
        color: borderColor,
        fillColor,
        weight: 2,
        fillOpacity: 0.8,
        opacity: 1,
      }}
      eventHandlers={{
        click: (e) => {
          e.originalEvent.stopPropagation();
          onClick();
        },
      }}
    >
      {zoom > 11 && (
        <Tooltip
          permanent
          direction="bottom"
          offset={[0, 5]}
          className="summit-marker-tooltip"
        >
          {String(activityCount)}
        </Tooltip>
      )}
    </CircleMarker>
  );
}
