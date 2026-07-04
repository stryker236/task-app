import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Tag, Task } from '../../../shared/types';
import { getTags, getTasks, type TaskFilters } from '../api';
import { createViewFilters, type ViewKey } from '../constants/tasks';
import { isOverdue, isToday } from '../utils/taskDates';

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export default function useDashboardData(view: ViewKey = 'kanban') {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [filtersByView, setFiltersByView] = useState(createViewFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const filters = filtersByView[view];

  function setFilters(nextFilters: TaskFilters) {
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
      setError(errorMessage(requestError));
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
    loading,
    error,
    setError,
    counters,
    fetchDashboardData
  };
}
