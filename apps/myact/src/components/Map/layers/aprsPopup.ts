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

/**
 * ポップアップの中身。スポットのコメントなどは誰でも書ける(SOTAwatch・APRS)ので、
 * HTML の文字列にせず、DOM を組み立てて textContent で入れる
 */
export function buildPopupContent(prop: AprsProperties): HTMLElement {
  const root = document.createElement('div');
  const title = document.createElement('b');
  const lastseen = formatDate(prop.lastseen, 'full');
  title.textContent = `${lastseen} ${prop.callsign} (${prop.distance}m from ${prop.summit})`;
  root.appendChild(title);

  if (prop.spot_time && parseInt(String(prop.distance)) < 500) {
    const spotTime = formatDate(prop.spot_time, 'time');
    const spot = document.createElement('div');
    spot.style.textAlign = 'center';
    const info = document.createElement('div');
    info.textContent = `${spotTime} ${prop.spot_freq || ''} ${prop.spot_mode || ''} ${prop.spot_summit || ''}`;
    const comment = document.createElement('div');
    comment.textContent = prop.spot_comment || '';
    spot.append(info, comment);
    root.appendChild(spot);
  }

  return root;
}
