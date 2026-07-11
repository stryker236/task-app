import type { ViewKey } from '../constants/tasks';

export const VIEW_PATHS: Record<ViewKey, string> = {
  kanban: '/',
  queue: '/queue',
  quickQueue: '/quick-queue',
  collections: '/collections',
  sharedNotes: '/shared-notes',
  calendar: '/calendar',
  learnedRules: '/learned-rules',
  schedulerRules: '/scheduler-rules',
  logs: '/logs',
  archived: '/archived'
};

export function viewPath(view: ViewKey) {
  return VIEW_PATHS[view];
}

export function viewFromPath(pathname: string): ViewKey | null {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';
  const match = Object.entries(VIEW_PATHS).find(([, path]) => path === normalizedPath);
  return match ? match[0] as ViewKey : null;
}

export function loginPath(returnTo = '') {
  return returnTo && returnTo !== '/'
    ? `/login?returnTo=${encodeURIComponent(returnTo)}`
    : '/login';
}
