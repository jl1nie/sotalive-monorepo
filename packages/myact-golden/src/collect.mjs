// 旧版の画面から、比べる値を取り出す(ポップアップ・マーカー)。
export const norm = (t) => t.replace(/\s+/g, ' ').trim();

/** 開いているポップアップの中身。text は行ごと(見出し・住所・リンクなど)、html は空白を詰めたもの */
export async function popup(page, { settleMs = 400 } = {}) {
  await page.locator('.leaflet-popup-content').last().waitFor({ timeout: 15000 });
  await page.waitForTimeout(settleMs);
  return page.evaluate(() => {
    const n = (t) => t.replace(/\s+/g, ' ').trim();
    const c = document.querySelector('.leaflet-popup-content');
    return {
      text: c.innerText.split('\n').map(n).filter(Boolean),
      html: n(c.innerHTML),
      links: [...c.querySelectorAll('a')].map((a) => ({ text: n(a.textContent), href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel') })),
      buttons: [...c.querySelectorAll('button')].map((b) => n(b.outerHTML)),
    };
  });
}

/** 地図に置いたマーカー(山の円・公園の四角)。色・大きさ・常時表示の文字 */
export async function markers(page) {
  return page.evaluate(() =>
    show_summit_marker.map((m) => {
      const tip = m.getTooltip && m.getTooltip();
      const tooltip = tip ? String(tip.getContent()).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : null;
      const ll = m.getLatLng();
      if (m instanceof L.CircleMarker) return { kind: 'summit', lat: ll.lat, lng: ll.lng, fill: m.options.fillColor, radius: m.options.radius, tooltip };
      return { kind: 'park', lat: ll.lat, lng: ll.lng, icon: m._icon ? m._icon.className.replace(/\s+/g, ' ').trim() : null, tooltip };
    }),
  );
}
