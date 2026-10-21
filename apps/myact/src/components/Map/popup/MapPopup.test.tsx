import { act, render, waitFor } from '@testing-library/react';
import { MapContainer } from 'react-leaflet';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMapStore } from '@/stores';
import { MapPopup } from './MapPopup';

const XSS = '<img src=x onerror="window.__xss=1">';

vi.mock('@/api/client', () => ({
  api: {
    getSotaSummit: vi.fn(async () => [
      {
        summitCode: 'JA/TK-001',
        summitName: 'x',
        summitNameJ: `山${XSS}`,
        cityJ: XSS,
        latitude: 35.6,
        longitude: 139.0,
        maidenhead: 'PM95',
        altM: 1000,
        points: 4,
        bonusPoints: 0,
        activationCount: 1,
        activationDate: '2026-10-01',
        activationCall: XSS,
      },
    ]),
    getPotaPark: vi.fn(async () => []),
  },
}));

vi.mock('@/api/revgeocode', () => ({
  reverseGeocode: vi.fn(async () => ({
    errors: 'OK',
    jccCode: '1001',
    prefecture: XSS,
    municipality: XSS,
    maidenhead: 'PM95',
  })),
}));

function renderPopup() {
  return render(
    <MapContainer center={[35.6, 139.0]} zoom={10} style={{ height: 300, width: 300 }}>
      <MapPopup />
    </MapContainer>
  );
}

describe('MapPopup', () => {
  beforeEach(() => useMapStore.setState({ markerPopup: null }));

  // 山名・逆ジオコーダーの結果などは外から来るので、HTML として解釈しない
  it('does not interpret summit and geocoder fields as HTML', async () => {
    renderPopup();
    act(() =>
      useMapStore.getState().setPopupData({
      type: 'summit',
      position: [35.6, 139.0],
      data: {} as never,
      })
    );
    await waitFor(() => expect(document.body.textContent).toContain(`山${XSS}`));
    await waitFor(() => expect(document.body.textContent).toContain('JCC1001'));
    expect(document.querySelector('.map-popup-content img')).toBeNull();
    expect(document.querySelector('.map-popup-content')?.textContent).toContain(XSS);
  });

  // 公園名(マーカーのデータ)も同じ。外部リンクは別のタブで、opener を渡さない
  it('renders park names as text and external links safely', async () => {
    renderPopup();
    act(() =>
      useMapStore.getState().setPopupData({
      type: 'park',
      position: [35.6, 139.0],
      data: { pota: 'JA-0001', nameJ: XSS } as never,
      })
    );
    await waitFor(() => expect(document.querySelector('.map-popup-content')).not.toBeNull());
    const content = document.querySelector('.map-popup-content')!;
    expect(content.querySelector('img')).toBeNull();
    expect(content.textContent).toContain(XSS);
    for (const a of content.querySelectorAll('a')) {
      expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    }
  });
});
