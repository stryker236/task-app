import { useEffect, useMemo, useState } from 'react';
import type { Task } from '../../../../../shared/types';
import type { SchedulerRuleConstraint } from '../api';

import {
  CONSTRAINT_OPTIONS,
  PRIORITY_OPTIONS,
  STATUS_OPTIONS,
  WEEKDAYS,
  appendTaskIdList,
  constraintLabel,
  dateList,
  draftFromConstraint,
  formatPayload,
  formatScope,
  numericList,
  selectedNumbers,
  selectedStrings,
  splitDateList,
  splitList,
  validateDraft,
  type ConstraintDraft
} from '../schedulerRuleUtils';
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




