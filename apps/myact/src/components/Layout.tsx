import { useState, useCallback, useEffect } from 'react';
import { Header } from './common/Header';
import { MapContainer } from './Map';
import { SpotList } from './Spots';
import { SettingsModal } from './Settings';
import { useGeolocation } from '@/hooks';
import { useSpotsStore, useMapStore } from '@/stores';

export function Layout() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isListOpen = useSpotsStore((s) => s.isListOpen);
  const toggleList = useSpotsStore((s) => s.toggleList);
  const setView = useMapStore((s) => s.setView);
  const setQthPosition = useMapStore((s) => s.setQthPosition);
  // 初期ロード時に権限が許可済みなら自動的に位置を取得
  const { position, loading, error, getCurrentPosition } = useGeolocation({
    autoFetchIfGranted: true,
  });

  // 位置情報取得後に地図を移動し、QTHマーカーを設置
  useEffect(() => {
    if (position) {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      setView([lat, lng], 15);
      setQthPosition({ lat, lng });
    }
  }, [position, setView, setQthPosition]);

  // エラー表示
  useEffect(() => {
    if (error) {
      console.error('Geolocation error:', error);
    }
  }, [error]);

  const handleQthClick = useCallback(() => {
    if (!loading) {
      getCurrentPosition();
    }
  }, [loading, getCurrentPosition]);

  const handleSpotsClick = useCallback(() => {
    toggleList();
  }, [toggleList]);

  const handleSettingsClick = useCallback(() => {
    setSettingsOpen((prev) => !prev);
  }, []);

  return (
    <div className="layout">
      <Header
        onQthClick={handleQthClick}
        onSpotsClick={handleSpotsClick}
        onSettingsClick={handleSettingsClick}
      />

      <main className="main-content">
        <div className={`map-area ${isListOpen ? 'with-sidebar' : ''}`}>
          <MapContainer />
        </div>

        {isListOpen && (
          <aside className="sidebar">
            <SpotList />
          </aside>
        )}
      </main>

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
