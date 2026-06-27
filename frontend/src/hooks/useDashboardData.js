import { useCallback, useEffect, useMemo, useState } from 'react';
import { getTags, getTasks } from '../api';
import { createViewFilters } from '../constants/tasks';
import { isOverdue, isToday } from '../utils/taskDates';

export default function useDashboardData(initialView = 'kanban') {
  const [tasks, setTasks] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [availableTags, setAvailableTags] = useState([]);
  const [filtersByView, setFiltersByView] = useState(createViewFilters);
  const [view, setView] = useState(initialView);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const filters = filtersByView[view];

  function setFilters(nextFilters) {
    setFiltersByView((current) => ({ ...current, [view]: nextFilters }));
  }

  const fetchDashboardData = useCallback(async (currentFilters = filters) => {
    try {
      setError('');
      const [filteredTasks, completeTaskList, tagCatalog] = await Promise.all([
        getTasks(currentFilters),
        getTasks({ includeArchived: true }),
        getTags()
      ]);
      setTasks(filteredTasks);
      setAllTasks(completeTaskList);
      setAvailableTags(tagCatalog);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const timer = setTimeout(() => fetchDashboardData(filters), 180);
    return () => clearTimeout(timer);
  }, [filters, fetchDashboardData]);

  const counters = useMemo(() => {
    const visibleTasks = allTasks.filter((task) => !task.isArchived);
    const active = visibleTasks.filter((task) => !['done', 'cancelled'].includes(task.status));
    return {
      total: visibleTasks.length,
      today: active.filter(isToday).length,
      overdue: active.filter(isOverdue).length,
      waiting: visibleTasks.filter((task) => task.status === 'waiting').length,
      noDue: active.filter((task) => !task.dueDateTime).length
    };
  }, [allTasks]);

  return {
    tasks,
    allTasks,
    availableTags,
    setAvailableTags,
    filtersByView,
    setFiltersByView,
    filters,
    setFilters,
    view,
    setView,
    loading,
    error,
    setError,
    counters,
    fetchDashboardData
  };
}
