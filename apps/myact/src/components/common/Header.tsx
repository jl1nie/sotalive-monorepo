import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMapMarkedAlt, faSatelliteDish, faCog } from '@fortawesome/free-solid-svg-icons';
import { useGeomag } from '@/hooks';
import { SearchInput } from '@/components/Search';

function formatTime(date: Date): string {
  const y = date.getFullYear().toString().slice(-2);
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  const h = date.getHours().toString().padStart(2, '0');
  const min = date.getMinutes().toString().padStart(2, '0');
  return `${y}/${m}/${d} ${h}:${min}`;
}

interface HeaderProps {
  onQthClick: () => void;
  onSpotsClick: () => void;
  onSettingsClick: () => void;
}

export function Header({ onQthClick, onSpotsClick, onSettingsClick }: HeaderProps) {
  const { data: geomag } = useGeomag();

  const now = new Date();
  const timeStr = formatTime(now);
  const geomagStr = geomag
    ? `A:${geomag.aIndex} K:${geomag.kIndex[0]}`
    : 'A:-- K:--';

  return (
    <header className="header">
      <div className="header-brand">
        <h1>MyACT</h1>
      </div>

      <div className="header-actions">
        <button
          className="btn btn-amber"
          onClick={onQthClick}
          title="現在位置を調べる"
        >
          <FontAwesomeIcon icon={faMapMarkedAlt} />
        </button>
        <button
          className="btn btn-info"
          onClick={onSpotsClick}
          title="最新スポットを表示"
        >
          <FontAwesomeIcon icon={faSatelliteDish} />
        </button>
        <button
          className="btn btn-primary"
          onClick={onSettingsClick}
          title="設定"
        >
          <FontAwesomeIcon icon={faCog} />
        </button>
      </div>

      <div className="header-search">
        <SearchInput />
      </div>

      <div className="header-info">
        <span className="clock">{timeStr}</span>
        <span className="geomag">{geomagStr}</span>
      </div>
    </header>
  );
}
