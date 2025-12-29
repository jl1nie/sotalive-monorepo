import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';

export function useSearch(query: string) {
  return useQuery({
    queryKey: ['search', query],
    queryFn: () => api.searchBrief(query),
    enabled: query.length >= 2,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
