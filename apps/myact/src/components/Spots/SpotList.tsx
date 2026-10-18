import { useState, useCallback } from 'react';
import { List, type RowComponentProps } from 'react-window';
import { useSpots, flattenSpots } from '@/hooks';
import { useSpotsStore, useMapStore, usePrefsStore } from '@/stores';
import { api } from '@/api/client';
import { SpotCard } from './SpotCard';
import { SpotChart } from './Chart';
import type { Spot } from '@/types';

const ITEM_HEIGHT = 100;

// react-window v2のrowComponent用props型
type SpotRowProps = {
  spots: Spot[];
  onSpotClick: (spot: Spot) => void;
};

function SpotRow({
  index,
  style,
  spots,
  onSpotClick,
}: RowComponentProps<SpotRowProps>) {
  const spot = spots[index];
  return (
    <div style={style}>
      <SpotCard spot={spot} onClick={() => onSpotClick(spot)} />
    </div>
  );
}

export function SpotList() {
  const [chartOpen, setChartOpen] = useState(false);
  const { data: spotGroups, isLoading } = useSpots();
  const program = useSpotsStore((s) => s.program);
  const setProgram = useSpotsStore((s) => s.setProgram);
  const spotPeriod = usePrefsStore((s) => s.spot_period);
  const setPreference = usePrefsStore((s) => s.setPreference);
  const setView = useMapStore((s) => s.setView);
  const setPopupData = useMapStore((s) => s.setPopupData);

  const spots = spotGroups ? flattenSpots(spotGroups, program) : [];

  const handleSpotClick = useCallback(
    async (spot: Spot) => {
      // リファレンスを検索して地図を移動
      try {
        const result = await api.searchBrief(spot.reference);
        if (result.candidates.length > 0) {
          const candidate = result.candidates[0];
          const { lat, lon } = candidate;
          // ズームイン（zoom 14）で移動
          setView([lat, lon], 14);
          // ポップアップ表示
          const isSota = spot.program === 'SOTA';
          setPopupData({
            type: isSota ? 'summit' : 'park',
            position: [lat, lon],
            data: isSota
              ? { lat, lon, alt: 0, count: 0 }
              : { lat, lon, pota: spot.reference, wwff: '', nameJ: spot.referenceDetail || '', locid: [] },
          });
        }
      } catch (error) {
        console.error('Failed to locate reference:', error);
      }
    },
    [setView, setPopupData]
  );

  return (
    <div className="spot-list">
      <div className="spot-list-header">
        <div className="spot-list-filters">
          <select
            value={program}
            onChange={(e) => setProgram(e.target.value as 'SOTA' | 'POTA' | 'ALL')}
          >
            <option value="ALL">SOTA/POTA</option>
            <option value="SOTA">SOTA</option>
            <option value="POTA">POTA</option>
          </select>
          <select
            value={spotPeriod}
            onChange={(e) => setPreference('spot_period', Number(e.target.value))}
          >
            {[1, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => (
              <option key={h} value={h}>
                {h}H
              </option>
            ))}
          </select>
        </div>
        <div className="spot-list-count">{spots.length} spots</div>
        <button
          className="spot-list-chart-btn"
          onClick={() => setChartOpen(true)}
          title="Show chart"
        >
          📊
        </button>
      </div>

      {isLoading ? (
        <div className="spot-list-loading">Loading...</div>
      ) : spots.length === 0 ? (
        <div className="spot-list-empty">No spots</div>
      ) : (
        <List
          rowCount={spots.length}
          rowHeight={ITEM_HEIGHT}
          rowComponent={SpotRow}
          rowProps={{ spots, onSpotClick: handleSpotClick }}
          style={{ height: 600, width: '100%' }}
        />
      )}

      <SpotChart isOpen={chartOpen} onClose={() => setChartOpen(false)} />
    </div>
  );
}
