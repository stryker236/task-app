import { useState } from 'react';
import { getTaskAdvisorAdvice } from '../api';

export default function useAdvisorController({ allTasks, setError, setViewingTask }) {
  const [advisor, setAdvisor] = useState(null);
  const [advisorLoading, setAdvisorLoading] = useState(false);

  async function refreshTaskAdvisorAdvice() {
    try {
      setAdvisorLoading(true);
      setAdvisor(await getTaskAdvisorAdvice(5));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setAdvisorLoading(false);
    }
  }

  function openAdvisorRecommendedTask(taskId) {
    const task = allTasks.find((item) => item.id === taskId);
    if (task) setViewingTask(task);
  }

  return {
    advisor,
    advisorLoading,
    refreshTaskAdvisorAdvice,
    openAdvisorRecommendedTask
  };
}
