import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient();

export function resetQueryCache() {
  queryClient.clear();
}
