import { useEffect, useRef, useCallback } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { usePrefsStore } from '@/stores';
import { api } from '@/api/client';
import type { AprsProperties } from '@/types';

function formatDate(dateStr: string, format: 'full' | 'time'): string {
  const date = new Date(dateStr);
  if (format === 'full') {
    return date.toLocaleString('en-us', {
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    });
  }
  return date.toLocaleString('en-us', {
    hour: 'numeric',
    minute: 'numeric',
  });
}

function createAprsMarker(ssid: string): L.DivIcon {
  let iconChar: string;
  const bgColor = '#ffeb3b';

  if (ssid === '5' || ssid === '7') {
    iconChar = '🚶';
  } else if (ssid === '9') {
    iconChar = '🚗';
  } else {
    iconChar = '🏠';
  }

  return L.divIcon({
    className: 'aprs-marker',
    html: `<div class="aprs-marker-icon" style="background-color: ${bgColor}">${iconChar}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function buildPopupContent(prop: AprsProperties): string {
  const lastseen = formatDate(prop.lastseen, 'full');
  let message = `<b>${lastseen} ${prop.callsign} (${prop.distance}m from ${prop.summit})</b>`;

  if (prop.spot_time && parseInt(String(prop.distance)) < 500) {
    const spotTime = formatDate(prop.spot_time, 'time');
    message += `<br><center>${spotTime} ${prop.spot_freq || ''} ${prop.spot_mode || ''} ${prop.spot_summit || ''}<br>${prop.spot_comment || ''}</center>`;
  }

  return message;
}

export function AprsTrackLayer() {
  const map = useMap();
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const aprsTrack = usePrefsStore((s) => s.aprs_track);

  const refreshTracks = useCallback(async () => {
    // 既存レイヤーをクリア
    if (layerGroupRef.current) {
      map.removeLayer(layerGroupRef.current);
    }

    if (!aprsTrack) {
      layerGroupRef.current = null;
      return;
    }

    const layerGroup = L.layerGroup();
    layerGroupRef.current = layerGroup;

    try {
      const response = await api.getAprsTrack(24);
      const tracks = response.tracks || [];

      for (const track of tracks) {
        const coords = track.geometry.coordinates;
        const prop = track.properties;

        // ポリライン（トラック）
        const latLngs = coords.map(([lon, lat]) => [lat, lon] as [number, number]);
        L.polyline(latLngs, {
          color: '#0d47a1',
          opacity: 0.4,
          weight: 4,
        }).addTo(layerGroup);

        // トラックポイント
        for (const [lon, lat] of coords) {
          L.circleMarker([lat, lon], {
            color: '#ff1744',
            radius: 2,
          }).addTo(layerGroup);
        }

        // 最終位置マーカー
        if (coords.length > 0) {
          const lastCoord = coords[coords.length - 1];
          const marker = L.marker([lastCoord[1], lastCoord[0]], {
            icon: createAprsMarker(prop.ssid),
          });
          marker.bindPopup(buildPopupContent(prop));
          marker.addTo(layerGroup);
        }
      }

      layerGroup.addTo(map);
    } catch (error) {
      console.error('Failed to fetch APRS tracks:', error);
    }
  }, [map, aprsTrack]);

  useEffect(() => {
    refreshTracks();

    return () => {
      if (layerGroupRef.current) {
        map.removeLayer(layerGroupRef.current);
        layerGroupRef.current = null;
      }
    };
  }, [refreshTracks, map]);

  return null;
}
