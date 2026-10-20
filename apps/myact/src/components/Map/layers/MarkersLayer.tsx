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
  const setPopupData = useMapStore((s) => s.setPopupData);

  // 地図の範囲のマーカーを読む(読み込みだけ。状態は、読み終えてから showMarkers で変える)
  const loadMarkers = useCallback(async (): Promise<SearchResult | null> => {
    const bounds = map.getBounds();
    const { elev, level } = getElevationThreshold(map.getZoom());
    try {
      return (await api.search({
        minLat: bounds.getSouth(),
        minLon: bounds.getWest(),
        maxLat: bounds.getNorth(),
        maxLon: bounds.getEast(),
        minElev: elev,
        minArea: level,
      })) as SearchResult;
    } catch (error) {
      console.error('Failed to fetch markers:', error);
      return null;
    }
  }, [map]);

  const showMarkers = useCallback((result: SearchResult | null) => {
    if (!result) return;
    setSummits(sotaRef ? result.sota || [] : []);
    setParks(result.pota || []);
  }, [sotaRef]);

  // 地図を動かしたら、ズームを覚えて(山のマーカーの大きさ)、マーカーを読み直す
  const onMapChange = useCallback(() => {
    setZoom(map.getZoom());
    loadMarkers().then(showMarkers);
  }, [map, loadMarkers, showMarkers]);
  useMapEvents({
    moveend: onMapChange,
    zoomend: onMapChange,
  });

  // 最初と、山の表示の設定を変えたとき。読み終える前に変わったら、古い結果は使わない
  useEffect(() => {
    let current = true;
    loadMarkers().then((result) => {
      if (current) showMarkers(result);
    });
    return () => {
      current = false;
    };
  }, [loadMarkers, showMarkers]);

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
