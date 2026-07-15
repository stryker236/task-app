export type ProductivityEventType =
  | 'task_completed'
  | 'checklist_completed'
  | 'progress_logged'
  | 'quick_queue_completed'
  | 'task_scheduled';

export interface ProductivityEvent {
  id: string;
  eventType: ProductivityEventType;
  xp: number;
  taskId: string | null;
  quickQueueItemId: string | null;
  checklistItemId: string | null;
  calendarEventId: string | null;
  metadata: Record<string, unknown>;
  occurredAt: string;
  createdAt: string;
}

export interface ProductivitySummary {
  todayXp: number;
  todayEventCount: number;
  dailyGoalXp: number;
  currentStreak: number;
  longestStreak: number;
  activeDaysThisWeek: number;
  recentEvents: ProductivityEvent[];
}
