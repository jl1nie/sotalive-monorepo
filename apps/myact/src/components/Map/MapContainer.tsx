import { MapContainer as LeafletMapContainer, TileLayer } from 'react-leaflet';
import { useMapStore } from '@/stores';
import { MAP_DEFAULTS, TILE_LAYERS } from '@/types/map';
import { MapEventHandler } from './MapEventHandler';
import {
  MarkersLayer,
  ParkPolygonLayer,
  ActivationZoneLayer,
  AprsTrackLayer,
  QthMarkerLayer,
} from './layers';
import { MapPopup } from './popup';
import 'leaflet/dist/leaflet.css';

export function MapContainer() {
  const center = useMapStore((s) => s.center);
  const zoom = useMapStore((s) => s.zoom);
  const selectedBaseLayer = useMapStore((s) => s.selectedBaseLayer);

  const tileConfig = TILE_LAYERS[selectedBaseLayer];

  return (
    <LeafletMapContainer
      center={center}
      zoom={zoom}
      minZoom={MAP_DEFAULTS.minZoom}
      maxZoom={MAP_DEFAULTS.maxZoom}
      className="map-container"
    >
      <TileLayer
        url={tileConfig.url}
        attribution={tileConfig.attribution}
        maxZoom={tileConfig.maxZoom}
        maxNativeZoom={tileConfig.maxNativeZoom}
      />
      <MapEventHandler />
      <ParkPolygonLayer />
      <MarkersLayer />
      <ActivationZoneLayer />
      <AprsTrackLayer />
      <QthMarkerLayer />
      <MapPopup />
    </LeafletMapContainer>
  );
}
