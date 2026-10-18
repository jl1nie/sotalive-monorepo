import { useMemo, Suspense, lazy, useCallback } from 'react';
import { useSpots, flattenSpots } from '@/hooks';
import { useSpotsStore, useMapStore } from '@/stores';
import { api } from '@/api/client';
import type { Spot } from '@/types';
import './SpotChart.css';

interface SpotChartProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ChartDataPoint {
  x: number; // timestamp
  y: number;
  z: string; // ツールチップ用
  ref: string;
  code: string;
}

interface ChartDataset {
  label: string;
  data: ChartDataPoint[];
}

// recharts を遅延ロード
const LazyScatterChart = lazy(() =>
  import('./ScatterChartContent').then((module) => ({
    default: module.ScatterChartContent,
  }))
);

function buildDatasets(spots: Spot[], program: 'SOTA' | 'POTA' | 'ALL'): ChartDataset[] {
  const targetPrograms = program === 'ALL' ? ['POTA', 'SOTA'] : [program];
  const datasets: ChartDataset[] = [];
  const refMap = new Map<string, Spot[]>();

  // リファレンスでグループ化
  for (const spot of spots) {
    if (!targetPrograms.includes(spot.program)) continue;
    const key = spot.reference;
    if (!refMap.has(key)) {
      refMap.set(key, []);
    }
    refMap.get(key)!.push(spot);
  }

  // データセット作成（Y軸はリファレンス順）
  let yIndex = 0;
  for (const [ref, refSpots] of refMap) {
    const data: ChartDataPoint[] = refSpots.map(spot => ({
      x: new Date(spot.spotTime).getTime(),
      y: yIndex,
      z: `${spot.activator} ${spot.reference} ${spot.frequency} ${spot.mode} ${spot.comment}`,
      ref,
      code: spot.reference,
    }));

    datasets.push({
      label: ref,
      data,
    });
    yIndex++;
  }

  return datasets;
}

export function SpotChart({ isOpen, onClose }: SpotChartProps) {
  const { data: spotGroups, isLoading } = useSpots();
  const program = useSpotsStore((s) => s.program);
  const setView = useMapStore((s) => s.setView);
  const setPopupData = useMapStore((s) => s.setPopupData);

  const spots = useMemo(() => {
    if (!spotGroups) return [];
    return flattenSpots(spotGroups, 'ALL');
  }, [spotGroups]);

  const datasets = useMemo(() => {
    return buildDatasets(spots, program);
  }, [spots, program]);

  // 時間範囲
  const { minTime, maxTime } = useMemo(() => {
    const now = new Date();
    // 6時間前から現在+5分まで
    return {
      minTime: now.getTime() - 6 * 60 * 60 * 1000,
      maxTime: now.getTime() + 5 * 60 * 1000,
    };
  }, []);

  // チャート高さ（リファレンス数に応じて動的に）
  const chartHeight = useMemo(() => {
    return Math.max(300, datasets.length * 25 + 120);
  }, [datasets]);

  // ポイントクリック時にマップ移動
  const handlePointClick = useCallback(async (code: string) => {
    try {
      const result = await api.searchBrief(code);
      if (result.candidates.length > 0) {
        const candidate = result.candidates[0];
        setView([candidate.lat, candidate.lon], 14);
        const isSota = code.includes('/');
        setPopupData({
          type: isSota ? 'summit' : 'park',
          position: [candidate.lat, candidate.lon],
          data: isSota
            ? { lat: candidate.lat, lon: candidate.lon, alt: 0, count: 0 }
            : { lat: candidate.lat, lon: candidate.lon, pota: code, wwff: '', nameJ: candidate.name, locid: [] },
        });
        onClose();
      }
    } catch (error) {
      console.error('Failed to locate reference:', error);
    }
  }, [setView, setPopupData, onClose]);

  if (!isOpen) return null;

  return (
    <div className="spotchart-overlay" onClick={onClose}>
      <div className="spotchart-modal spotchart-modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="spotchart-header">
          <h2>Spot Activity</h2>
          <button className="spotchart-close" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="spotchart-body">
          {isLoading ? (
            <div className="spotchart-loading">Loading...</div>
          ) : spots.length === 0 ? (
            <div className="spotchart-empty">No spot data available</div>
          ) : (
            <Suspense fallback={<div className="spotchart-loading">Loading chart...</div>}>
              <LazyScatterChart
                datasets={datasets}
                minTime={minTime}
                maxTime={maxTime}
                height={chartHeight}
                onPointClick={handlePointClick}
              />
            </Suspense>
          )}
        </div>

        <div className="spotchart-summary">
          <div className="spotchart-stat">
            <span className="spotchart-stat-label">Total:</span>
            <span className="spotchart-stat-value">{spots.length}</span>
          </div>
          <div className="spotchart-stat">
            <span className="spotchart-stat-label">SOTA:</span>
            <span className="spotchart-stat-value sota">
              {spots.filter((s) => s.program === 'SOTA').length}
            </span>
          </div>
          <div className="spotchart-stat">
            <span className="spotchart-stat-label">POTA:</span>
            <span className="spotchart-stat-value pota">
              {spots.filter((s) => s.program === 'POTA').length}
            </span>
          </div>
        </div>

        <div className="spotchart-footer">
          <button className="btn btn-close" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
