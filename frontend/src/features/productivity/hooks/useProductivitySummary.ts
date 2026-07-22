import { useCallback, useEffect, useState } from 'react';
import type { ProductivitySummary } from '../../../../../shared/types';
import { getProductivitySummary } from '../api';

const EMPTY_SUMMARY: ProductivitySummary = {
  todayXp: 0,
  todayEventCount: 0,
  dailyGoalXp: 50,
  currentStreak: 0,
  longestStreak: 0,
  activeDaysThisWeek: 0,
  recentEvents: []
};

const PRODUCTIVITY_PATHS = [
  /^\/tasks\/[^/]+$/,
  /^\/tasks\/[^/]+\/checklist\/[^/]+$/,
  /^\/tasks\/[^/]+\/progress$/,
  /^\/quick-queue\/[^/]+$/,
  /^\/google\/calendar\/events$/,
  /^\/ai\/commands\/apply$/
];

function shouldRefresh(path: string) {
  return PRODUCTIVITY_PATHS.some((pattern) => pattern.test(path));
}

export default function useProductivitySummary({ setError }: { setError: (message: string) => void }) {
  const [summary, setSummary] = useState<ProductivitySummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(false);

  const refreshProductivitySummary = useCallback(async () => {
    setLoading(true);
    try {
      setSummary(await getProductivitySummary());
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Falha ao carregar produtividade');
    } finally {
      setLoading(false);
    }
  }, [setError]);

  useEffect(() => {
    refreshProductivitySummary();
  }, [refreshProductivitySummary]);

  useEffect(() => {
    function onApiResponse(event: Event) {
      const detail = (event as CustomEvent<{ path?: string }>).detail;
      if (detail?.path && shouldRefresh(detail.path)) refreshProductivitySummary();
    }
    window.addEventListener('task-app:api-response', onApiResponse);
    return () => window.removeEventListener('task-app:api-response', onApiResponse);
  }, [refreshProductivitySummary]);

  return { productivitySummary: summary, productivityLoading: loading, refreshProductivitySummary };
}

