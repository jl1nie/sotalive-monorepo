import { useEffect, useState, useCallback } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import { SummitMarker, ParkMarker } from '../markers';
import { api } from '@/api/client';
import { usePrefsStore, useMapStore } from '@/stores';
import type { SotaSummitMarker, PotaParkMarker, SearchResult } from '@/types';

function getElevationThreshold(zoom: number): { elev: number; level: number } {
  if (zoom >= 13) return { elev: 0, level: 0 };
  if (zoom > 9) return { elev: 800, level: 1 };
  if (zoom > 8) return { elev: 1000, level: 10 };
  if (zoom > 6) return { elev: 1500, level: 20 };
  return { elev: 4000, level: 30 };
}

export function MarkersLayer() {
  const map = useMap();
  const [summits, setSummits] = useState<SotaSummitMarker[]>([]);
  const [parks, setParks] = useState<PotaParkMarker[]>([]);
  const [zoom, setZoom] = useState(map.getZoom());

  const sotaRef = usePrefsStore((s) => s.sota_ref);
  const showPotaLog = usePrefsStore((s) => s.show_potalog);
  const setPopupData = useMapStore((s) => s.setPopupData);

  const fetchMarkers = useCallback(async () => {
    const bounds = map.getBounds();
    const currentZoom = map.getZoom();
    setZoom(currentZoom);

    const { elev, level } = getElevationThreshold(currentZoom);

    try {
      const result = await api.search({
        minLat: bounds.getSouth(),
        minLon: bounds.getWest(),
        maxLat: bounds.getNorth(),
        maxLon: bounds.getEast(),
        minElev: elev,
        minArea: level,
      }) as SearchResult;

      if (sotaRef) {
        setSummits(result.sota || []);
      } else {
        setSummits([]);
      }
      setParks(result.pota || []);
    } catch (error) {
      console.error('Failed to fetch markers:', error);
    }
  }, [map, sotaRef, showPotaLog]);

  useMapEvents({
    moveend: fetchMarkers,
    zoomend: fetchMarkers,
  });

  useEffect(() => {
    fetchMarkers();
  }, [fetchMarkers]);

  const handleSummitClick = useCallback(
    (summit: SotaSummitMarker) => {
      setPopupData({
        type: 'summit',
        position: [summit.lat, summit.lon],
        data: summit,
      });
    },
    [setPopupData]
  );

  const handleParkClick = useCallback(
    (park: PotaParkMarker) => {
      setPopupData({
        type: 'park',
        position: [park.lat, park.lon],
        data: park,
      });
    },
    [setPopupData]
  );

  return (
    <>
      {summits.map((summit, idx) => (
        <SummitMarker
          key={`summit-${summit.lat}-${summit.lon}-${idx}`}
          position={[summit.lat, summit.lon]}
          elevation={summit.alt}
          activityCount={summit.count}
          zoom={zoom}
          onClick={() => handleSummitClick(summit)}
        />
      ))}
      {parks.map((park, idx) => (
        <ParkMarker
          key={`park-${park.pota || park.wwff || idx}`}
          position={[park.lat, park.lon]}
          park={park}
          onClick={() => handleParkClick(park)}
        />
      ))}
    </>
  );
}
