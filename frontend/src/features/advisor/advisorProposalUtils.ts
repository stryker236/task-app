import type { Task } from '../../../../shared/types';
import type { AdvisorPreview } from './api';

export const COMMAND_LABELS = {
  update_task: 'Atualizar task',
  add_relation: 'Adicionar relacao',
  create_task: 'Criar task',
  create_calendar_event: 'Criar evento'
};

export const VISIBLE_FIELDS = [
  ['title', 'Titulo'],
  ['notes', 'Notas'],
  ['priority', 'Prioridade'],
  ['status', 'Estado'],
  ['dueDateTime', 'Prazo'],
  ['estimatedMinutes', 'Estimativa'],
  ['isFavorite', 'Favorita'],
  ['tags', 'Tags'],
  ['blockedByTaskIds', 'Blocked by'],
  ['checklistItems', 'Checklist']
] as const;

export type ProposalStatus = 'accepted' | 'ignored';
export type ProposalStatuses = Record<string, ProposalStatus>;
export type ProposalFeedbackStatuses = Record<string, 'saved'>;
export type ObjectRecord = Record<string, unknown>;

export function isObject(value: unknown): value is ObjectRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function fieldValue(source: unknown, field: string) {
  return isObject(source) ? source[field] : undefined;
}

export function formatValue(value: unknown): string {
  if (Array.isArray(value) && value.some((item) => isObject(item))) {
    return value.length ? value.map((item) => `${item.isDone ? '✓' : '□'} ${String(item.title || '')}`).join('; ') : '—';
  }
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  if (value === true) return 'sim';
  if (value === false) return 'nao';
  if (value == null || value === '') return '—';
  return String(value);
}

export function changedFields(before: unknown = {}, after: unknown = {}) {
  return VISIBLE_FIELDS
    .map(([field, label]) => ({ field, label, before: fieldValue(before, field), after: fieldValue(after, field) }))
    .filter((change) => JSON.stringify(change.before ?? null) !== JSON.stringify(change.after ?? null));
}

export function affectedCardTitle(proposal: AdvisorPreview['commands'][number]) {
  const changes = proposal.changes as ObjectRecord | undefined;
  const calendarEvent = changes?.calendarEvent as ObjectRecord | undefined;
  const createdTask = fieldValue(changes?.createdTask, 'title');
  const beforeTitle = fieldValue(changes?.before, 'title');
  const afterTitle = fieldValue(changes?.after, 'title');
  if (proposal.type === 'create_task') return typeof createdTask === 'string' ? createdTask : 'Nova task';
  if (proposal.type === 'create_calendar_event') return String(calendarEvent?.summary || proposal.summary || 'Novo evento');
  return String(beforeTitle || afterTitle || proposal.taskId || 'Task');
}

export function proposedTags(proposal: AdvisorPreview['commands'][number]) {
  const changes = proposal.changes as ObjectRecord | undefined;
  const after = fieldValue(changes?.after, 'tags');
  const created = fieldValue(changes?.createdTask, 'tags');
  const tags = Array.isArray(after) ? after : Array.isArray(created) ? created : [];
  return tags.map(String).filter(Boolean);
}

export function isPriorityProposal(proposal: AdvisorPreview['commands'][number]) {
  const fields = changedFields((proposal.changes as ObjectRecord | undefined)?.before, (proposal.changes as ObjectRecord | undefined)?.after);
  return proposal.type === 'update_task' && fields.length === 1 && fields[0]?.field === 'priority';
}

export function isDueDateProposal(proposal: AdvisorPreview['commands'][number]) {
  const fields = changedFields((proposal.changes as ObjectRecord | undefined)?.before, (proposal.changes as ObjectRecord | undefined)?.after);
  return proposal.type === 'update_task' && fields.length === 1 && fields[0]?.field === 'dueDateTime';
}

export function isCalendarEventProposal(proposal: AdvisorPreview['commands'][number]) {
  return proposal.type === 'create_calendar_event';
}

export function proposalCalendarStart(proposal: AdvisorPreview['commands'][number]) {
  const calendarEvent = (proposal.changes as ObjectRecord | undefined)?.calendarEvent as ObjectRecord | undefined;
  return typeof calendarEvent?.start === 'string' ? calendarEvent.start : '';
}

export function proposalDayKey(proposal: AdvisorPreview['commands'][number]) {
  const start = proposalCalendarStart(proposal);
  if (!start) return '';
  const date = new Date(start);
  if (Number.isNaN(date.getTime())) return start.slice(0, 10);
  return date.toISOString().slice(0, 10);
}

export function formatProposalDay(day: string) {
  const date = new Date(`${day}T00:00:00`);
  if (Number.isNaN(date.getTime())) return day;
  return new Intl.DateTimeFormat('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' }).format(date);
}
export function taskTitleFromId(allTasks: Task[], id: string | null) {
  if (!id) return null;
  return allTasks.find((task) => task.id === id)?.title || id;
}



