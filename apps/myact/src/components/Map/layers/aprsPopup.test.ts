import { describe, expect, it } from 'vitest';
import { buildPopupContent } from './aprsPopup';

const XSS = '<img src=x onerror="window.__xss=1">';

describe('buildPopupContent', () => {
  // スポットのコメントなどは誰でも書けるので、HTML として解釈しない
  it('does not interpret untrusted fields as HTML', () => {
    const el = buildPopupContent({
      ssid: '7',
      callsign: `JA1AAA${XSS}`,
      lastseen: '2026-10-22T01:00:00Z',
      distance: 120,
      summit: `JA/TK-001${XSS}`,
      spot_summit: XSS,
      spot_time: '2026-10-22T01:00:00Z',
      spot_freq: XSS,
      spot_mode: XSS,
      spot_comment: XSS,
    });
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain(XSS);
  });

  it('shows the spot only when the station is near the summit', () => {
    const base = {
      ssid: '7',
      callsign: 'JA1AAA',
      lastseen: '2026-10-22T01:00:00Z',
      summit: 'JA/TK-001',
      spot_time: '2026-10-22T01:00:00Z',
      spot_comment: 'QRV now',
    };
    expect(buildPopupContent({ ...base, distance: 120 }).textContent).toContain('QRV now');
    expect(buildPopupContent({ ...base, distance: 800 }).textContent).not.toContain('QRV now');
  });
});
