import type { TaskFilters } from '../api';

export type ViewKey = 'kanban' | 'queue' | 'quickQueue' | 'collections' | 'sharedNotes' | 'calendar' | 'periodicTasks' | 'scheduledReview' | 'productivity' | 'settings' | 'learnedRules' | 'schedulerRules' | 'logs' | 'archived';

export const VIEW_KEYS = ['kanban', 'queue', 'quickQueue', 'collections', 'sharedNotes', 'calendar', 'periodicTasks', 'scheduledReview', 'productivity', 'settings', 'learnedRules', 'schedulerRules', 'logs', 'archived'] as const satisfies readonly ViewKey[];

export const EMPTY_FILTERS: TaskFilters = {
  search: '',
  status: '',
  priority: '',
  tags: [],
  tagMode: 'and',
  overdue: false,
  today: false,
  noDueDate: false,
  favoriteOnly: false,
  hideBlocked: false,
  hideDone: false,
  hideCancelled: true
};

export const createViewFilters = (): Record<ViewKey, TaskFilters> => ({
  kanban: { ...EMPTY_FILTERS, tags: [] },
  queue: { ...EMPTY_FILTERS, tags: [] },
  quickQueue: { ...EMPTY_FILTERS, tags: [] },
  collections: { ...EMPTY_FILTERS, tags: [] },
  sharedNotes: { ...EMPTY_FILTERS, tags: [] },
  calendar: { ...EMPTY_FILTERS, tags: [] },
  periodicTasks: { ...EMPTY_FILTERS, tags: [] },
  scheduledReview: { ...EMPTY_FILTERS, tags: [] },
  productivity: { ...EMPTY_FILTERS, tags: [] },
  settings: { ...EMPTY_FILTERS, tags: [] },
  learnedRules: { ...EMPTY_FILTERS, tags: [] },
  schedulerRules: { ...EMPTY_FILTERS, tags: [] },
  logs: { ...EMPTY_FILTERS, tags: [] },
  archived: { ...EMPTY_FILTERS, tags: [], archived: true, hideDone: false, hideCancelled: false }
});
