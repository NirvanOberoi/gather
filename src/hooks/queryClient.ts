import { QueryClient } from '@tanstack/react-query';
import { BackendError } from '@/services/backend/types';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      retry: (count, err) => !(err instanceof BackendError && ['forbidden', 'not_found', 'unauthenticated', 'validation'].includes(err.code)) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
});
