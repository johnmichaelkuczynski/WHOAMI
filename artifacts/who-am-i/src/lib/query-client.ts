import { QueryClient } from '@tanstack/react-query';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 5,
        retryDelay: attempt => Math.min(1000 * 2 ** attempt, 5000),
        refetchOnReconnect: true,
        refetchOnWindowFocus: true,
      },
    },
  });
}
