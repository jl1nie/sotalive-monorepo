import { useEffect, useState } from 'react';
import { Popup, useMap } from 'react-leaflet';
import { useMapStore, usePrefsStore } from '@/stores';
import { api } from '@/api/client';
import { reverseGeocode } from '@/api/revgeocode';
import type { SotaSummit, PotaPark, ReverseGeocodeResult } from '@/types';

export function MapPopup() {
  const map = useMap();
  const markerPopup = useMapStore((s) => s.markerPopup);
  const setPopupData = useMapStore((s) => s.setPopupData);
  const showPotaLog = usePrefsStore((s) => s.show_potalog);
  const potaHunterId = usePrefsStore((s) => s.pota_hunter_uuid);
  const potaActivatorId = usePrefsStore((s) => s.pota_activator_uuid);

  const [content, setContent] = useState<string>('読み込み中...');
  const [summitData, setSummitData] = useState<SotaSummit | null>(null);
  const [parkData, setParkData] = useState<PotaPark | null>(null);
  const [geoData, setGeoData] = useState<ReverseGeocodeResult | null>(null);

  useEffect(() => {
    if (!markerPopup) {
      setContent('読み込み中...');
      setSummitData(null);
      setParkData(null);
      setGeoData(null);
      return;
    }

    const popupData = markerPopup;
    const [lat, lon] = popupData.position;
    const data = popupData.data;

    async function loadDetails() {
      try {
        // logIdを取得（hunter優先）
        const logId = potaHunterId || potaActivatorId || undefined;

        if (popupData.type === 'summit') {
          // SOTAサミット詳細取得
          const summits = await api.getSotaSummit(lat, lon, 200, logId);
          if (summits.length > 0) {
            setSummitData(summits[0]);
          }
        } else if (popupData.type === 'park') {
          // POTA公園詳細取得
          const parkData = data as { pota?: string };
          const potaCode = parkData.pota;
          if (potaCode) {
            const parks = await api.getPotaPark(potaCode, logId);
            if (parks.length > 0) {
              setParkData(parks[0]);
            }
          }
        }

        // 逆ジオコーダー取得
        const geo = await reverseGeocode(lat, lon, true);
        setGeoData(geo);
      } catch (error) {
        console.error('Failed to load popup details:', error);
      }
    }

    loadDetails();
  }, [markerPopup, showPotaLog, potaHunterId, potaActivatorId]);

  useEffect(() => {
    if (!markerPopup) return;

    const [lat, lon] = markerPopup.position;
    const data = markerPopup.data;
    const lines: string[] = [];
    const zoom = map.getZoom() > 11 ? 11 : map.getZoom();
    const windyUrl = `https://www.windy.com/${lat}/${lon}/meteogram?rain,${lat},${lon},${zoom}`;

    // SOTAサミットの表示（オリジナル準拠）
    if (markerPopup.type === 'summit') {
      if (summitData) {
        // タイトル: コード + 山名
        lines.push(`<b>${summitData.summitCode} ${summitData.summitNameJ || summitData.summitName}</b>`);
        // 都市名
        if (summitData.cityJ) lines.push(summitData.cityJ);
        // GL + 位置リンク
        const posLink = `<a href="https://maps.google.com/?q=${summitData.latitude},${summitData.longitude}" target="_blank">${summitData.latitude},${summitData.longitude}</a>`;
        lines.push(`GL:${summitData.maidenhead}<br>位置:${posLink}`);
        // 標高 + ポイント（1行）
        lines.push(`標高:${summitData.altM}m,${summitData.points}pts (+${summitData.bonusPoints})`);
        // Activations
        lines.push(`Activations: ${summitData.activationCount}`);
        // Last Activation
        if (summitData.activationCount > 0 && summitData.activationDate) {
          lines.push(`Last Activation: ${summitData.activationDate}(${summitData.activationCall})`);
        }
      } else {
        lines.push('<b>SOTA Summit</b>');
        lines.push('読み込み中...');
      }
    } else {
      // POTA/JAFF公園の表示（オリジナル準拠）
      const p = data as { pota?: string; wwff?: string; nameJ?: string };
      const refs: string[] = [];
      if (p.pota) refs.push(p.pota.replace('JA-', 'JP-'));
      if (p.wwff) refs.push(p.wwff);
      // タイトル: リファレンス
      if (refs.length > 0) {
        lines.push(`<b>${refs.join(' / ')}</b>`);
      }
      // 公園名
      if (p.nameJ) lines.push(p.nameJ);
    }

    // 逆ジオコーダー情報（SOTA/POTA共通）
    if (geoData && geoData.errors === 'OK') {
      // JCC/JCG + 都市名
      if (geoData.jccCode) {
        if (geoData.wardCode) {
          lines.push(`JCC${geoData.jccCode} 区番号:${geoData.wardCode}`);
        } else {
          lines.push(`JCC${geoData.jccCode}`);
        }
        lines.push(`${geoData.prefecture || ''}${geoData.municipality || ''}`);
      } else if (geoData.jcgCode) {
        lines.push(`JCG${geoData.jcgCode}${geoData.hamlogCode || ''}`);
        lines.push(`${geoData.prefecture || ''}${geoData.jcgText || ''}${geoData.municipality || ''}`);
      }
      // GL + 位置（POTA用）
      if (markerPopup.type === 'park') {
        const posLink = `<a href="https://maps.google.com/?q=${lat},${lon}" target="_blank">${lat.toFixed(6)},${lon.toFixed(6)}</a>`;
        lines.push(`GL:${geoData.maidenhead}<br>位置:${posLink}`);
      }
      // 標高
      if (geoData.elevation !== undefined) {
        lines.push(`標高:${geoData.elevation}m`);
      }
    } else if (geoData && geoData.errors === 'OUTSIDE_JA') {
      lines.push(`Pos: ${lat.toFixed(6)},${lon.toFixed(6)}`);
      lines.push(`GL: ${geoData.maidenhead}`);
    }

    // 天気リンク
    lines.push(`&nbsp;&nbsp;<a href="${windyUrl}" target="_blank">☀️🌥️🌧️</a>`);

    // POTA Activations/QSOs（show_potalog有効時）
    if (markerPopup.type === 'park' && parkData && showPotaLog) {
      if (parkData.attempts !== undefined && parkData.attempts !== null) {
        lines.push(`Activations/Attempts: ${parkData.activations ?? 0}/${parkData.attempts}`);
        if (parkData.qsos !== undefined && parkData.qsos !== null) {
          lines.push(`QSOs: ${parkData.qsos}`);
        }
      } else if (parkData.qsos !== undefined && parkData.qsos !== null) {
        lines.push(`QSOs: ${parkData.qsos}`);
      }
    }

    setContent(lines.join('<br>'));
  }, [markerPopup, summitData, parkData, geoData, map, showPotaLog]);

  if (!markerPopup) return null;

  const handleClose = () => {
    setPopupData(null);
  };

  return (
    <Popup
      position={markerPopup.position}
      eventHandlers={{
        remove: handleClose,
      }}
    >
      <div
        className="map-popup-content"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </Popup>
  );
}
