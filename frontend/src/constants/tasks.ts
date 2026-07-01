import type { TaskFilters } from '../api';

export type ViewKey = 'kanban' | 'queue' | 'quickQueue' | 'collections' | 'sharedNotes' | 'calendar' | 'archived';

export const VIEW_KEYS = ['kanban', 'queue', 'quickQueue', 'collections', 'sharedNotes', 'calendar', 'archived'] as const satisfies readonly ViewKey[];

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
  archived: { ...EMPTY_FILTERS, tags: [], archived: true, hideDone: false, hideCancelled: false }
});
