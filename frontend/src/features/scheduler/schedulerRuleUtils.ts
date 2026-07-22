import type { Task } from '../../../../shared/types';
import type { SchedulerRule, SchedulerRuleConstraint } from './api';
export type ConstraintDraft = {
  type: string;
  enabled: boolean;
  hard: boolean;
  scope: {
    allTasks: boolean;
    tags: string;
    titleIncludes: string;
    taskIds: string;
    statuses: string[];
    priorities: number[];
  };
  payload: Record<string, string | number | number[] | string[]>;
};

export const STATUS_OPTIONS = ['new', 'in_progress', 'waiting', 'done', 'cancelled'];
export const PRIORITY_OPTIONS = [1, 2, 3, 4];
export const WEEKDAYS = [
  [1, 'Seg'],
  [2, 'Ter'],
  [3, 'Qua'],
  [4, 'Qui'],
  [5, 'Sex'],
  [6, 'Sab'],
  [7, 'Dom']
] as const;

export const CONSTRAINT_OPTIONS = [
  ['blocked_window', 'Bloquear janela'],
  ['allowed_window', 'Permitir janela'],
  ['preferred_window', 'Preferir janela'],
  ['avoid_day', 'Evitar dias'],
  ['min_duration', 'Duracao minima'],
  ['max_duration', 'Duracao maxima'],
  ['priority_boost', 'Prioridade extra'],
  ['tag_group_preference', 'Agrupar conceito'],
  ['daily_limit', 'Limite diario'],
  ['break_after_task', 'Pausa apos tarefa'],
  ['break_after_work_block', 'Pausa apos bloco'],
  ['allowed_date', 'Data exata']
] as const;

export function formatPayload(payload: Record<string, unknown>) {
  const entries = Object.entries(payload || {});
  if (!entries.length) return 'Sem parametros';
  return entries.map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`).join('; ');
}

export function formatScope(scope: Record<string, unknown>) {
  const entries = Object.entries(scope || {}).filter(([, value]) => !(Array.isArray(value) && value.length === 0));
  if (!entries.length) return 'Todas as tarefas elegiveis';
  return entries.map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`).join('; ');
}

export function constraintLabel(constraint: Pick<SchedulerRuleConstraint, 'type' | 'hard'>) {
  const label = CONSTRAINT_OPTIONS.find(([type]) => type === constraint.type)?.[1] || constraint.type;
  const strength = constraint.hard ? 'Obrigatoria' : 'Preferencia';
  return `${label} - ${strength}`;
}

function textList(value: unknown) {
  return Array.isArray(value) ? value.join(', ') : '';
}

export function numericList(value: unknown) {
  return Array.isArray(value) ? value.map(Number).filter(Number.isFinite) : [];
}

export function dateList(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

export function draftFromConstraint(constraint: SchedulerRuleConstraint): ConstraintDraft {
  return {
    type: constraint.type,
    enabled: constraint.enabled,
    hard: constraint.hard,
    scope: {
      allTasks: constraint.scope?.allTasks === true || !Object.keys(constraint.scope || {}).length,
      tags: textList(constraint.scope?.tags),
      titleIncludes: textList(constraint.scope?.titleIncludes),
      taskIds: textList(constraint.scope?.taskIds),
      statuses: Array.isArray(constraint.scope?.statuses) ? constraint.scope.statuses.map(String) : [],
      priorities: numericList(constraint.scope?.priorities)
    },
    payload: { ...(constraint.payload || {}) } as ConstraintDraft['payload']
  };
}

export function splitList(value: string) {
  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
}

export function splitDateList(value: unknown) {
  return [...new Set(String(Array.isArray(value) ? value.join(', ') : value || '').split(',').map((item) => item.trim()).filter(Boolean))];
}

export function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function selectedNumbers(current: number[], value: number, checked: boolean) {
  const set = new Set(current);
  if (checked) set.add(value);
  else set.delete(value);
  return [...set].sort((left, right) => left - right);
}

export function selectedStrings(current: string[], value: string, checked: boolean) {
  const set = new Set(current);
  if (checked) set.add(value);
  else set.delete(value);
  return [...set];
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

export function constraintAppliesToTask(constraint: { scope?: Record<string, unknown> }, task: Task) {
  const scope = constraint.scope || {};
  const keys = Object.keys(scope).filter((key) => {
    const value = scope[key];
    return !(Array.isArray(value) && value.length === 0) && value !== false && value != null;
  });
  if (!keys.length || scope.allTasks === true) return true;
  const tags = arrayValue(scope.tags);
  if (tags.length && !tags.some((tag) => task.tags.includes(tag))) return false;
  const titleIncludes = arrayValue(scope.titleIncludes).map((item) => item.toLocaleLowerCase());
  if (titleIncludes.length && !titleIncludes.some((item) => task.title.toLocaleLowerCase().includes(item))) return false;
  const taskIds = arrayValue(scope.taskIds);
  if (taskIds.length && !taskIds.includes(task.id)) return false;
  const statuses = arrayValue(scope.statuses);
  if (statuses.length && !statuses.includes(task.status)) return false;
  const priorities = Array.isArray(scope.priorities) ? scope.priorities.map(Number) : [];
  if (priorities.length && !priorities.includes(task.priority)) return false;
  return true;
}

export function ruleAppliesToTask(rule: SchedulerRule, task: Task) {
  return rule.enabled && rule.status === 'active' && rule.constraints.some((constraint) => constraint.enabled && constraintAppliesToTask(constraint, task));
}

export function appendTaskIdList(current: string, taskId: string) {
  return [...new Set([...splitList(current), taskId])].join(', ');
}


function validateTimeRange(payload: Record<string, unknown>, errors: string[]) {
  const startTime = String(payload.startTime || '');
  const endTime = String(payload.endTime || '');
  if (!startTime || !endTime) errors.push('Preenche inicio e fim.');
  if (startTime && endTime && endTime <= startTime) errors.push('A hora final tem de ser depois da inicial.');
}

function isValidDateText(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function validateDateFilters(payload: Record<string, unknown>, errors: string[], required = false) {
  const date = String(payload.date || '').trim();
  const dates = splitDateList(payload.dates);
  if (date && !isValidDateText(date)) errors.push('Data tem de usar YYYY-MM-DD.');
  for (const item of dates) {
    if (!isValidDateText(item)) errors.push(`Data invalida: ${item}`);
  }
  if (required && !date && !dates.length) errors.push('Escolhe uma data ou lista de datas.');
}

export function validateDraft(draft: ConstraintDraft) {
  const errors: string[] = [];
  const payload = draft.payload;
  if (['blocked_window', 'allowed_window', 'preferred_window'].includes(draft.type)) {
    validateTimeRange(payload, errors);
    validateDateFilters(payload, errors);
  }
  if (draft.type === 'avoid_day' && !numericList(payload.days).length) errors.push('Escolhe pelo menos um dia.');
  if (['min_duration', 'max_duration'].includes(draft.type) && numberValue(payload.minutes) <= 0) errors.push('Minutos tem de ser maior que zero.');
  if (draft.type === 'daily_limit' && numberValue(payload.max) <= 0) errors.push('Limite tem de ser maior que zero.');
  if (draft.type === 'daily_limit') validateDateFilters(payload, errors);
  if (draft.type === 'break_after_task' && numberValue(payload.breakMinutes) <= 0) errors.push('Pausa tem de ser maior que zero.');
  if (draft.type === 'break_after_work_block') {
    if (numberValue(payload.workMinutes) <= 0) errors.push('Bloco de trabalho tem de ser maior que zero.');
    if (numberValue(payload.breakMinutes) <= 0) errors.push('Pausa tem de ser maior que zero.');
  }
  if (draft.type === 'allowed_date') {
    validateDateFilters(payload, errors, true);
    const hasStart = Boolean(payload.startTime);
    const hasEnd = Boolean(payload.endTime);
    if (hasStart || hasEnd) validateTimeRange(payload, errors);
  }
  if (draft.type === 'priority_boost') {
    validateDateFilters(payload, errors);
    const hasStart = Boolean(payload.startTime);
    const hasEnd = Boolean(payload.endTime);
    if (hasStart || hasEnd) validateTimeRange(payload, errors);
    if (payload.weight !== '' && payload.weight != null && (numberValue(payload.weight) < 1 || numberValue(payload.weight) > 10)) errors.push('Peso tem de estar entre 1 e 10.');
  }
  if (draft.type === 'tag_group_preference') {
    if (!String(payload.concept || '').trim()) errors.push('Conceito e obrigatorio.');
    if (splitList(String(Array.isArray(payload.resolvedTags) ? payload.resolvedTags.join(', ') : payload.resolvedTags || '')).length < 2) errors.push('Precisa de pelo menos duas tags resolvidas.');
    if (payload.strength !== '' && payload.strength != null && (numberValue(payload.strength) < 0.1 || numberValue(payload.strength) > 1)) errors.push('Forca tem de estar entre 0.1 e 1.');
    validateDateFilters(payload, errors);
    const hasStart = Boolean(payload.startTime);
    const hasEnd = Boolean(payload.endTime);
    if (hasStart || hasEnd) validateTimeRange(payload, errors);
    if (payload.weight !== '' && payload.weight != null && (numberValue(payload.weight) < 1 || numberValue(payload.weight) > 50000)) errors.push('Peso tem de estar entre 1 e 50000.');
  }
  return errors;
}

function cleanPayload(draft: ConstraintDraft) {
  const payload = draft.payload;
  const dates = splitDateList(payload.dates);
  const dateFilter = {
    ...(payload.date ? { date: String(payload.date) } : {}),
    ...(dates.length ? { dates } : {})
  };
  if (['blocked_window', 'allowed_window', 'preferred_window'].includes(draft.type)) {
    return {
      startTime: String(payload.startTime || ''),
      endTime: String(payload.endTime || ''),
      ...(numericList(payload.days).length ? { days: numericList(payload.days) } : {}),
      ...dateFilter
    };
  }
  if (draft.type === 'avoid_day') return { days: numericList(payload.days) };
  if (['min_duration', 'max_duration'].includes(draft.type)) return { minutes: numberValue(payload.minutes) };
  if (draft.type === 'daily_limit') {
    return {
      max: numberValue(payload.max),
      ...(numericList(payload.days).length ? { days: numericList(payload.days) } : {}),
      ...dateFilter,
      ...(payload.startTime && payload.endTime ? { startTime: String(payload.startTime), endTime: String(payload.endTime) } : {})
    };
  }
  if (draft.type === 'break_after_task') {
    return {
      breakMinutes: numberValue(payload.breakMinutes),
      ...(numberValue(payload.minDurationMinutes) > 0 ? { minDurationMinutes: numberValue(payload.minDurationMinutes) } : {})
    };
  }
  if (draft.type === 'break_after_work_block') return { workMinutes: numberValue(payload.workMinutes), breakMinutes: numberValue(payload.breakMinutes) };
  if (draft.type === 'allowed_date') {
    return {
      ...dateFilter,
      ...(payload.startTime && payload.endTime ? { startTime: String(payload.startTime), endTime: String(payload.endTime) } : {})
    };
  }
  if (draft.type === 'priority_boost') {
    return {
      ...(numericList(payload.days).length ? { days: numericList(payload.days) } : {}),
      ...dateFilter,
      ...(payload.startTime && payload.endTime ? { startTime: String(payload.startTime), endTime: String(payload.endTime) } : {}),
      ...(numberValue(payload.weight) > 0 ? { weight: numberValue(payload.weight) } : {})
    };
  }
  if (draft.type === 'tag_group_preference') {
    return {
      concept: String(payload.concept || '').trim(),
      resolvedTags: splitList(String(Array.isArray(payload.resolvedTags) ? payload.resolvedTags.join(', ') : payload.resolvedTags || '')),
      strength: numberValue(payload.strength) > 0 ? numberValue(payload.strength) : 0.6,
      scope: 'block',
      timeMode: String(payload.timeMode || 'preferred') === 'required' ? 'required' : 'preferred',
      ...(numericList(payload.days).length ? { days: numericList(payload.days) } : {}),
      ...dateFilter,
      ...(payload.startTime && payload.endTime ? { startTime: String(payload.startTime), endTime: String(payload.endTime) } : {}),
      ...(numberValue(payload.weight) > 0 ? { weight: numberValue(payload.weight) } : {})
    };
  }
  return {};
}

export function buildConstraint(draft: ConstraintDraft) {
  const scope: Record<string, unknown> = {};
  if (draft.scope.allTasks) scope.allTasks = true;
  const tags = splitList(draft.scope.tags);
  const titleIncludes = splitList(draft.scope.titleIncludes);
  const taskIds = splitList(draft.scope.taskIds);
  if (tags.length) delete scope.allTasks, scope.tags = tags;
  if (titleIncludes.length) delete scope.allTasks, scope.titleIncludes = titleIncludes;
  if (taskIds.length) delete scope.allTasks, scope.taskIds = taskIds;
  if (draft.scope.statuses.length) delete scope.allTasks, scope.statuses = draft.scope.statuses;
  if (draft.scope.priorities.length) delete scope.allTasks, scope.priorities = draft.scope.priorities;
  return {
    type: draft.type,
    scope,
    payload: cleanPayload(draft),
    hard: draft.hard,
    enabled: draft.enabled
  };
}



