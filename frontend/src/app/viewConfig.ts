import type { ViewKey } from '../constants/tasks';

export const APP_CHROME_HIDDEN_VIEWS = new Set<ViewKey>(['productivity', 'settings']);

export const TASK_WORKSPACE_VIEWS = new Set<ViewKey>(['kanban', 'queue', 'collections']);

export const TASK_FILTER_VIEWS = new Set<ViewKey>(['kanban', 'queue', 'collections', 'archived']);

export function showsAppDashboardChrome(view: ViewKey) {
  return !APP_CHROME_HIDDEN_VIEWS.has(view);
}

export function showsTaskWorkspaceChrome(view: ViewKey) {
  return TASK_WORKSPACE_VIEWS.has(view);
}

export function showsTaskFilters(view: ViewKey) {
  return TASK_FILTER_VIEWS.has(view);
}
