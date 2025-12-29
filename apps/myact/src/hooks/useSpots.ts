import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { usePrefsStore } from '@/stores';
import type { SpotGroup, Spot } from '@/types';

export function useSpots() {
  const spotPeriod = usePrefsStore((s) => s.spot_period);
  const byCall = usePrefsStore((s) => s.by_call);
  const logId = usePrefsStore((s) =>
    s.show_potaactlog ? s.pota_activator_uuid : s.pota_hunter_uuid
  );

  return useQuery({
    queryKey: ['spots', spotPeriod, byCall, logId],
    queryFn: () =>
      api.getSpots({
        hoursAgo: spotPeriod,
        byCall,
        logId: logId ?? undefined,
      }),
    refetchInterval: 60000, // 1分ごと自動更新
    staleTime: 30000,
  });
}

/** スポットをフラットなリストに変換（新しい順） */
export function flattenSpots(
  groups: SpotGroup[],
  program: 'SOTA' | 'POTA' | 'ALL'
): Spot[] {
  const spots: Spot[] = [];

  for (const group of groups) {
    for (const spot of group.values) {
      if (program === 'ALL' || spot.program === program) {
        spots.push(spot);
      }
    }
  }

  // 新しい順にソート
  return spots.sort(
    (a, b) => new Date(b.spotTime).getTime() - new Date(a.spotTime).getTime()
  );
}
