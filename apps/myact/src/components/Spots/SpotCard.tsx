import type { Spot } from '@/types';

interface SpotCardProps {
  spot: Spot;
  onClick: () => void;
}

function formatSpotTime(isoTime: string): string {
  const date = new Date(isoTime);
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

export function SpotCard({ spot, onClick }: SpotCardProps) {
  const timeStr = formatSpotTime(spot.spotTime);
  const programClass = spot.program === 'SOTA' ? 'spot-sota' : 'spot-pota';

  return (
    <div className={`spot-card ${programClass}`} onClick={onClick}>
      <div className="spot-card-header">
        <span className="spot-activator">{spot.activator}</span>
        <span className="spot-time">{timeStr}</span>
      </div>
      <div className="spot-card-body">
        <span className="spot-reference">{spot.reference}</span>
        {spot.referenceDetail && (
          <span className="spot-name">{spot.referenceDetail}</span>
        )}
      </div>
      <div className="spot-card-footer">
        <span className="spot-frequency">{spot.frequency}</span>
        <span className="spot-mode">{spot.mode}</span>
      </div>
      {spot.comment && (
        <div className="spot-card-comment">
          <span className="spot-comment">{spot.comment}</span>
        </div>
      )}
    </div>
  );
}
