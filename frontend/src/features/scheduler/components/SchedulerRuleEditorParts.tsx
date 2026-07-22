import { useEffect, useMemo, useState } from 'react';
import type { Task } from '../../../../../shared/types';
import type { SchedulerRule, SchedulerRuleConstraint } from '../api';
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

const STATUS_OPTIONS = ['new', 'in_progress', 'waiting', 'done', 'cancelled'];
const PRIORITY_OPTIONS = [1, 2, 3, 4];
const WEEKDAYS = [
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

function constraintLabel(constraint: Pick<SchedulerRuleConstraint, 'type' | 'hard'>) {
  const label = CONSTRAINT_OPTIONS.find(([type]) => type === constraint.type)?.[1] || constraint.type;
  const strength = constraint.hard ? 'Obrigatoria' : 'Preferencia';
  return `${label} - ${strength}`;
}

function textList(value: unknown) {
  return Array.isArray(value) ? value.join(', ') : '';
}

function numericList(value: unknown) {
  return Array.isArray(value) ? value.map(Number).filter(Number.isFinite) : [];
}

function dateList(value: unknown) {
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

function splitList(value: string) {
  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
}

function splitDateList(value: unknown) {
  return [...new Set(String(Array.isArray(value) ? value.join(', ') : value || '').split(',').map((item) => item.trim()).filter(Boolean))];
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function selectedNumbers(current: number[], value: number, checked: boolean) {
  const set = new Set(current);
  if (checked) set.add(value);
  else set.delete(value);
  return [...set].sort((left, right) => left - right);
}

function selectedStrings(current: string[], value: string, checked: boolean) {
  const set = new Set(current);
  if (checked) set.add(value);
  else set.delete(value);
  return [...set];
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function constraintAppliesToTask(constraint: { scope?: Record<string, unknown> }, task: Task) {
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

function appendTaskIdList(current: string, taskId: string) {
  return [...new Set([...splitList(current), taskId])].join(', ');
}

function TaskIdPicker({
  tasks,
  currentValue,
  copiedTaskId,
  onCopy,
  onInsert
}: {
  tasks: Task[];
  currentValue: string;
  copiedTaskId: string;
  onCopy: (task: Task) => void;
  onInsert: (value: string) => void;
}) {
  const [search, setSearch] = useState('');
  const selectedIds = splitList(currentValue);
  const visibleTasks = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return tasks
      .filter((task) => !term || task.title.toLocaleLowerCase().includes(term) || task.id.toLocaleLowerCase().includes(term))
      .slice(0, 12);
  }, [search, tasks]);

  return (
    <div className="scheduler-task-id-picker">
      <label>
        <span>Encontrar task ID</span>
        <input value={search} placeholder="Pesquisar por titulo ou ID" onChange={(event) => setSearch(event.target.value)} />
      </label>
      <div className="scheduler-task-id-list">
        {visibleTasks.length ? visibleTasks.map((task) => (
          <article key={task.id}>
            <div>
              <strong>{task.title}</strong>
              <code>{task.id}</code>
            </div>
            <div>
              <button type="button" className="button ghost small" onClick={() => onCopy(task)}>{copiedTaskId === task.id ? 'Copiado' : 'Copiar'}</button>
              <button type="button" className="button secondary small" disabled={selectedIds.includes(task.id)} onClick={() => onInsert(appendTaskIdList(currentValue, task.id))}>
                {selectedIds.includes(task.id) ? 'No escopo' : 'Usar'}
              </button>
            </div>
          </article>
        )) : <p className="advisor-empty">Nenhuma tarefa encontrada.</p>}
      </div>
    </div>
  );
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

function WeekdayPicker({ value, onChange }: { value: number[]; onChange: (value: number[]) => void }) {
  return (
    <div className="scheduler-checkbox-row">
      {WEEKDAYS.map(([day, label]) => (
        <label key={day}>
          <input type="checkbox" checked={value.includes(day)} onChange={(event) => onChange(selectedNumbers(value, day, event.target.checked))} />
          <span>{label}</span>
        </label>
      ))}
    </div>
  );
}

function DateFilterFields({ payload, setPayload, includeSingle = true }: { payload: ConstraintDraft['payload']; setPayload: (patch: Record<string, string | number | number[] | string[]>) => void; includeSingle?: boolean }) {
  return (
    <>
      {includeSingle && <label><span>Data concreta opcional</span><input type="date" value={String(payload.date || '')} onChange={(event) => setPayload({ date: event.target.value })} /></label>}
      <label><span>Lista de datas opcionais</span><input value={dateList(payload.dates).join(', ')} placeholder="2026-07-22, 2026-07-25" onChange={(event) => setPayload({ dates: splitDateList(event.target.value) })} /></label>
    </>
  );
}

function PayloadFields({ draft, onChange }: { draft: ConstraintDraft; onChange: (draft: ConstraintDraft) => void }) {
  const payload = draft.payload;
  const setPayload = (patch: Record<string, string | number | number[] | string[]>) => onChange({ ...draft, payload: { ...payload, ...patch } });
  if (['blocked_window', 'allowed_window', 'preferred_window'].includes(draft.type)) {
    return (
      <div className="scheduler-editor-stack">
        <div className="scheduler-editor-grid two">
          <label><span>Inicio</span><input type="time" value={String(payload.startTime || '')} onChange={(event) => setPayload({ startTime: event.target.value })} /></label>
          <label><span>Fim</span><input type="time" value={String(payload.endTime || '')} onChange={(event) => setPayload({ endTime: event.target.value })} /></label>
        </div>
        <span className="scheduler-editor-label">Dias da semana opcionais</span>
        <WeekdayPicker value={numericList(payload.days)} onChange={(days) => setPayload({ days })} />
        <div className="scheduler-editor-grid two">
          <DateFilterFields payload={payload} setPayload={setPayload} />
        </div>
      </div>
    );
  }
  if (draft.type === 'avoid_day') return <WeekdayPicker value={numericList(payload.days)} onChange={(days) => setPayload({ days })} />;
  if (['min_duration', 'max_duration'].includes(draft.type)) {
    return <label><span>Minutos</span><input type="number" min="1" max="1440" value={String(payload.minutes || '')} onChange={(event) => setPayload({ minutes: event.target.value })} /></label>;
  }
  if (draft.type === 'daily_limit') {
    return (
      <div className="scheduler-editor-stack">
        <label><span>Maximo por dia</span><input type="number" min="1" max="50" value={String(payload.max || '')} onChange={(event) => setPayload({ max: event.target.value })} /></label>
        <span className="scheduler-editor-label">Dias da semana opcionais</span>
        <WeekdayPicker value={numericList(payload.days)} onChange={(days) => setPayload({ days })} />
        <div className="scheduler-editor-grid two">
          <DateFilterFields payload={payload} setPayload={setPayload} />
        </div>
        <div className="scheduler-editor-grid two">
          <label><span>Inicio opcional</span><input type="time" value={String(payload.startTime || '')} onChange={(event) => setPayload({ startTime: event.target.value })} /></label>
          <label><span>Fim opcional</span><input type="time" value={String(payload.endTime || '')} onChange={(event) => setPayload({ endTime: event.target.value })} /></label>
        </div>
      </div>
    );
  }
  if (draft.type === 'break_after_task') {
    return (
      <div className="scheduler-editor-grid two">
        <label><span>Pausa minutos</span><input type="number" min="1" max="240" value={String(payload.breakMinutes || '')} onChange={(event) => setPayload({ breakMinutes: event.target.value })} /></label>
        <label><span>Duracao minima opcional</span><input type="number" min="1" max="1440" value={String(payload.minDurationMinutes || '')} onChange={(event) => setPayload({ minDurationMinutes: event.target.value })} /></label>
      </div>
    );
  }
  if (draft.type === 'break_after_work_block') {
    return (
      <div className="scheduler-editor-grid two">
        <label><span>Trabalho minutos</span><input type="number" min="1" max="1440" value={String(payload.workMinutes || '')} onChange={(event) => setPayload({ workMinutes: event.target.value })} /></label>
        <label><span>Pausa minutos</span><input type="number" min="1" max="240" value={String(payload.breakMinutes || '')} onChange={(event) => setPayload({ breakMinutes: event.target.value })} /></label>
      </div>
    );
  }
  if (draft.type === 'allowed_date') {
    return (
      <div className="scheduler-editor-stack">
        <div className="scheduler-editor-grid two">
          <DateFilterFields payload={payload} setPayload={setPayload} includeSingle />
        </div>
        <div className="scheduler-editor-grid two">
          <label><span>Inicio opcional</span><input type="time" value={String(payload.startTime || '')} onChange={(event) => setPayload({ startTime: event.target.value })} /></label>
          <label><span>Fim opcional</span><input type="time" value={String(payload.endTime || '')} onChange={(event) => setPayload({ endTime: event.target.value })} /></label>
        </div>
      </div>
    );
  }
  return (
    <div className="scheduler-editor-stack">
      <span className="scheduler-editor-label">Dias da semana opcionais</span>
      <WeekdayPicker value={numericList(payload.days)} onChange={(days) => setPayload({ days })} />
      <div className="scheduler-editor-grid two">
        <DateFilterFields payload={payload} setPayload={setPayload} />
      </div>
      <div className="scheduler-editor-grid three">
        <label><span>Inicio opcional</span><input type="time" value={String(payload.startTime || '')} onChange={(event) => setPayload({ startTime: event.target.value })} /></label>
        <label><span>Fim opcional</span><input type="time" value={String(payload.endTime || '')} onChange={(event) => setPayload({ endTime: event.target.value })} /></label>
        <label><span>Peso opcional</span><input type="number" min="1" max="10" value={String(payload.weight || '')} onChange={(event) => setPayload({ weight: event.target.value })} /></label>
      </div>
    </div>
  );
}

export function ConstraintDetails({
  constraint,
  copied,
  saving,
  tasks,
  copiedTaskId,
  onCopy,
  onCopyTaskId,
  onSave
}: {
  constraint: SchedulerRuleConstraint;
  copied: boolean;
  saving: boolean;
  tasks: Task[];
  copiedTaskId: string;
  onCopy: (constraint: SchedulerRuleConstraint) => void;
  onCopyTaskId: (task: Task) => void;
  onSave: (constraint: SchedulerRuleConstraint, draft: ConstraintDraft) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const [draft, setDraft] = useState(() => draftFromConstraint(constraint));
  const errors = validateDraft(draft);
  const constraintJson = JSON.stringify(constraint, null, 2);

  useEffect(() => {
    setDraft(draftFromConstraint(constraint));
    setEditing(false);
  }, [constraint.id]);

  return (
    <article className="scheduler-constraint-card">
      <header>
        <strong>{constraintLabel(constraint)}</strong>
        <span>{constraint.enabled ? 'ativa' : 'desativada'}</span>
      </header>
      {editing ? (
        <div className="scheduler-constraint-editor">
          <div className="scheduler-editor-grid two">
            <label><span>Tipo</span><select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value, payload: {} })}>{CONSTRAINT_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label><span>Forca</span><select value={draft.hard ? 'hard' : 'soft'} onChange={(event) => setDraft({ ...draft, hard: event.target.value === 'hard' })}><option value="hard">Obrigatoria</option><option value="soft">Preferencia</option></select></label>
          </div>

          <div className="scheduler-editor-toggles">
            <label><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} /> <span>Ativa</span></label>
            <label><input type="checkbox" checked={draft.scope.allTasks} onChange={(event) => setDraft({ ...draft, scope: { ...draft.scope, allTasks: event.target.checked } })} /> <span>Todas as tarefas se nao houver filtros</span></label>
          </div>

          <fieldset className="scheduler-editor-fieldset">
            <legend>Escopo seguro</legend>
            <div className="scheduler-editor-grid two">
              <label><span>Tags</span><input value={draft.scope.tags} placeholder="focus, admin" onChange={(event) => setDraft({ ...draft, scope: { ...draft.scope, tags: event.target.value } })} /></label>
              <label><span>Titulo contem</span><input value={draft.scope.titleIncludes} placeholder="invoice, cliente" onChange={(event) => setDraft({ ...draft, scope: { ...draft.scope, titleIncludes: event.target.value } })} /></label>
              <label><span>Task IDs</span><input value={draft.scope.taskIds} placeholder="uuid1, uuid2" onChange={(event) => setDraft({ ...draft, scope: { ...draft.scope, taskIds: event.target.value } })} /></label>
            </div>
            <TaskIdPicker
              tasks={tasks}
              currentValue={draft.scope.taskIds}
              copiedTaskId={copiedTaskId}
              onCopy={onCopyTaskId}
              onInsert={(taskIds) => setDraft({ ...draft, scope: { ...draft.scope, taskIds, allTasks: false } })}
            />
            <span className="scheduler-editor-label">Estados</span>
            <div className="scheduler-checkbox-row">{STATUS_OPTIONS.map((status) => <label key={status}><input type="checkbox" checked={draft.scope.statuses.includes(status)} onChange={(event) => setDraft({ ...draft, scope: { ...draft.scope, statuses: selectedStrings(draft.scope.statuses, status, event.target.checked) } })} /><span>{status}</span></label>)}</div>
            <span className="scheduler-editor-label">Prioridades</span>
            <div className="scheduler-checkbox-row">{PRIORITY_OPTIONS.map((priority) => <label key={priority}><input type="checkbox" checked={draft.scope.priorities.includes(priority)} onChange={(event) => setDraft({ ...draft, scope: { ...draft.scope, priorities: selectedNumbers(draft.scope.priorities, priority, event.target.checked) } })} /><span>P{priority}</span></label>)}</div>
          </fieldset>

          <fieldset className="scheduler-editor-fieldset">
            <legend>Parametros seguros</legend>
            <PayloadFields draft={draft} onChange={setDraft} />
          </fieldset>

          {errors.length > 0 && <p className="scheduler-editor-error">{errors.join(' ')}</p>}
          <div className="scheduler-editor-actions">
            <button type="button" className="button primary small" disabled={saving || errors.length > 0} onClick={() => onSave(constraint, draft)}>{saving ? 'A guardar...' : 'Guardar correcao'}</button>
            <button type="button" className="button ghost small" onClick={() => { setDraft(draftFromConstraint(constraint)); setEditing(false); }}>Cancelar</button>
          </div>
        </div>
      ) : (
        <>
          <dl>
            <div><dt>Escopo</dt><dd>{formatScope(constraint.scope)}</dd></div>
            <div><dt>Parametros</dt><dd>{formatPayload(constraint.payload)}</dd></div>
            <div>
              <dt>Acoes</dt>
              <dd className="scheduler-constraint-actions">
                <button type="button" className="button secondary small" onClick={() => setEditing(true)}>Editar seguro</button>
                <button type="button" className="button secondary small" onClick={() => setShowJson((current) => !current)}>{showJson ? 'Ocultar JSON' : 'Ver JSON'}</button>
                <button type="button" className="button ghost small" onClick={() => onCopy(constraint)}>{copied ? 'Copiado' : 'Copiar JSON'}</button>
              </dd>
            </div>
          </dl>
          {showJson && <pre className="scheduler-constraint-json">{constraintJson}</pre>}
        </>
      )}
    </article>
  );
}



