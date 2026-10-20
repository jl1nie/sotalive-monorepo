import { useEffect, useState } from 'react';
import { GeoJSON } from 'react-leaflet';
import type { GeoJsonObject, Feature, Geometry } from 'geojson';
import * as topojson from 'topojson-client';
import type { LeafletMouseEvent, PathOptions } from 'leaflet';
import { usePrefsStore, useMapStore } from '@/stores';

interface ParkProperties {
  POTA: string;
  JAFF: string;
  NAME: string;
  PID?: string;
  UID?: string;
}

// TopoJSON types (simplified for our needs)
interface TopoGeometryObject {
  type: string;
  geometries?: TopoGeometryObject[];
  arcs?: number[] | number[][] | number[][][];
  properties?: Record<string, unknown>;
}

interface TopoTopology {
  type: 'Topology';
  objects: Record<string, TopoGeometryObject>;
  arcs: number[][][];
}

const POLYGON_STYLE: PathOptions = {
  color: '#000',
  opacity: 1,
  weight: 1,
  fillColor: '#9fa8da',
  fillOpacity: 0.3,
};

export function ParkPolygonLayer() {
  const [geoData, setGeoData] = useState<GeoJsonObject | null>(null);
  const displayArea = usePrefsStore((s) => s.display_area);
  const setPopupData = useMapStore((s) => s.setPopupData);

  // 公園の区域は、表示するときに一度だけ読む(表示を切り替えても、読み直さない)
  useEffect(() => {
    if (!displayArea || geoData) return;

    async function loadTopoJson() {
      try {
        const response = await fetch('/json/jaffpota-annotated-v22.json');
        const data = await response.json() as TopoTopology;

        // TopoJSONをGeoJSONに変換
        const features: Feature<Geometry, ParkProperties>[] = [];
        for (const key in data.objects) {
          if (Object.prototype.hasOwnProperty.call(data.objects, key)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const geojson = topojson.feature(data as any, data.objects[key] as any) as
              Feature<Geometry, ParkProperties> |
              { type: 'FeatureCollection'; features: Feature<Geometry, ParkProperties>[] };

            if (geojson.type === 'FeatureCollection') {
              features.push(...geojson.features);
            } else {
              features.push(geojson);
            }
          }
        }

        setGeoData({
          type: 'FeatureCollection',
          features,
        } as GeoJsonObject);
      } catch (error) {
        console.error('Failed to load TopoJSON:', error);
      }
    }

    loadTopoJson();
  }, [displayArea, geoData]);

  if (!displayArea || !geoData) {
    return null;
  }

  const onEachFeature = (
    feature: Feature<Geometry, ParkProperties>,
    layer: L.Layer
  ) => {
    layer.on('click', (e: LeafletMouseEvent) => {
      const props = feature.properties;
      setPopupData({
        type: 'park',
        position: [e.latlng.lat, e.latlng.lng],
        data: {
          lat: e.latlng.lat,
          lon: e.latlng.lng,
          pota: props.POTA,
          wwff: props.JAFF,
          nameJ: props.NAME,
          locid: [],
        },
      });
      e.originalEvent.stopPropagation();
    });
  };

  return (
    <GeoJSON
      key={displayArea ? 'park-polygons' : 'none'}
      data={geoData}
      style={() => POLYGON_STYLE}
      onEachFeature={onEachFeature}
    />
  );
}
