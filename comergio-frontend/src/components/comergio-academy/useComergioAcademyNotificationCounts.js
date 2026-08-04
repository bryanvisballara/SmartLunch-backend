import { useQuery } from '@tanstack/react-query';
import { getConectaUnreadCount } from '../../services/conecta.service';
import { getInformaUnreadCount } from '../../services/informa.service';
import { getComergioAcademyNotificationCounts } from './academyNotifications';

export function useComergioAcademyNotificationCounts(enabled = true) {
  const conectaQuery = useQuery({
    queryKey: ['conecta-unread-count'],
    queryFn: async () => {
      try {
        const response = await getConectaUnreadCount();
        return Number(response.data?.unreadCount || 0);
      } catch {
        return 0;
      }
    },
    enabled,
    refetchInterval: 60_000,
    retry: false,
  });

  const informaQuery = useQuery({
    queryKey: ['informa-unread-count'],
    queryFn: async () => {
      try {
        const response = await getInformaUnreadCount();
        return Number(response.data?.unreadCount || 0);
      } catch {
        return 0;
      }
    },
    enabled,
    refetchInterval: 60_000,
    retry: false,
  });

  const counts = getComergioAcademyNotificationCounts({
    conecta: Number(conectaQuery.data || 0),
    informa: Number(informaQuery.data || 0),
  });

  return {
    ...counts,
    isLoading: conectaQuery.isLoading || informaQuery.isLoading,
    refetch: async () => {
      await Promise.all([conectaQuery.refetch(), informaQuery.refetch()]);
    },
  };
}
