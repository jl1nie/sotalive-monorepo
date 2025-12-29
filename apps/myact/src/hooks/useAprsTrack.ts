import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { usePrefsStore } from '@/stores';

export function useAprsTrack() {
  const aprsEnabled = usePrefsStore((s) => s.aprs_track);

  return useQuery({
    queryKey: ['aprs-track'],
    queryFn: () => api.getAprsTrack(24),
    enabled: aprsEnabled,
    refetchInterval: 3 * 60 * 1000, // 3分ごと
    staleTime: 60 * 1000,
  });
}
