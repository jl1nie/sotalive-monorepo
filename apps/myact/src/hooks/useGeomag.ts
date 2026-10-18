import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';

export function useGeomag() {
  return useQuery({
    queryKey: ['geomag'],
    queryFn: () => api.getGeomag(),
    refetchInterval: 30 * 60 * 1000, // 30分ごと
    staleTime: 15 * 60 * 1000,
  });
}
