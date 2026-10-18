// Reverse Geocoder API (クライアントサイド実装)
// GSI逆ジオコーダー + sotaapp2 JCC/JCG API + GSI標高APIを組み合わせ

import type { ReverseGeocodeResult } from '@/types';

const ENDPOINTS = {
  gsiRevgeocode: 'https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress',
  jccJcg: '/api/v2/locator/jcc-jcg', // sotaapp2 backend via middleware
  elevation: 'https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php',
};

// キャッシュ
const cache = new Map<string, ReverseGeocodeResult>();
const elevCache = new Map<string, { elevation: number | string; hsrc: string }>();

async function getElevation(lat: number, lon: number): Promise<{ elevation: number | string; hsrc: string }> {
  const cacheKey = `${lat},${lon}`;

  if (elevCache.has(cacheKey)) {
    return elevCache.get(cacheKey)!;
  }

  if (elevCache.size >= 16) {
    const oldest = elevCache.keys().next().value;
    if (oldest) elevCache.delete(oldest);
  }

  try {
    const url = `${ENDPOINTS.elevation}?lat=${lat}&lon=${lon}&outtype=JSON`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status}`);

    const data = await res.json();
    const result = {
      elevation: data.elevation,
      hsrc: data.hsrc || '',
    };

    elevCache.set(cacheKey, result);
    return result;
  } catch {
    return { elevation: '-----', hsrc: '' };
  }
}

// sotaapp2 JCC/JCG APIのレスポンス型
interface JccJcgResponse {
  muniCode: number | null;
  prefecture: string | null;
  municipality: string | null;
  jccCode: string | null;
  wardCode: string | null;
  jccText: string | null;
  jcgCode: string | null;
  jcgText: string | null;
  hamlogCode: string | null;
  maidenhead: string;
}

export async function reverseGeocode(lat: number, lon: number, elev = true): Promise<ReverseGeocodeResult> {
  const cacheKey = `${lat},${lon},${elev}`;

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)!;
  }

  if (cache.size >= 16) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }

  try {
    // 1. GSI逆ジオコーダーで市区町村コードを取得
    const gsiUrl = `${ENDPOINTS.gsiRevgeocode}?lat=${lat}&lon=${lon}`;
    const gsiRes = await fetch(gsiUrl);
    const gsiData = await gsiRes.json();

    // GSI結果がない場合は日本国外
    if (!gsiData.results) {
      // maidenhead だけでも取得を試みる
      try {
        const jccUrl = `${ENDPOINTS.jccJcg}?lat=${lat}&lon=${lon}`;
        const jccRes = await fetch(jccUrl);
        const jccData: JccJcgResponse = await jccRes.json();
        const result: ReverseGeocodeResult = {
          errors: 'OUTSIDE_JA',
          maidenhead: jccData.maidenhead || '',
        };
        cache.set(cacheKey, result);
        return result;
      } catch {
        const result: ReverseGeocodeResult = {
          errors: 'OUTSIDE_JA',
          maidenhead: '',
        };
        cache.set(cacheKey, result);
        return result;
      }
    }

    const muniCode = gsiData.results.muniCd;
    const addr1 = gsiData.results.lv01Nm;

    // 2. sotaapp2 JCC/JCG APIでJCC/JCG情報を取得
    const jccUrl = `${ENDPOINTS.jccJcg}?lat=${lat}&lon=${lon}&muni_code=${muniCode}`;
    const jccRes = await fetch(jccUrl);

    if (!jccRes.ok) {
      throw new Error(`JCC/JCG API error: ${jccRes.status}`);
    }

    const jccData: JccJcgResponse = await jccRes.json();

    // 3. 標高取得（オプション）
    let elevation: number | undefined;
    let hsrc: string | undefined;

    if (elev) {
      const elevData = await getElevation(lat, lon);
      if (elevData.elevation !== '-----') {
        elevation = typeof elevData.elevation === 'string'
          ? parseFloat(elevData.elevation)
          : elevData.elevation;
        hsrc = elevData.hsrc;
      }
    }

    // 結果を組み立て
    const result: ReverseGeocodeResult = {
      errors: 'OK',
      prefecture: jccData.prefecture || undefined,
      municipality: jccData.municipality || undefined,
      addr1,
      jccCode: jccData.jccCode || undefined,
      jcgCode: jccData.jcgCode || undefined,
      jccText: jccData.jccText || undefined,
      wardCode: jccData.wardCode || undefined,
      hamlogCode: jccData.hamlogCode || undefined,
      jcgText: jccData.jcgText || undefined,
      maidenhead: jccData.maidenhead || '',
      elevation,
      hsrc,
    };

    cache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.error('Reverse geocode error:', error);
    return {
      errors: 'ERROR',
      maidenhead: '',
    };
  }
}
