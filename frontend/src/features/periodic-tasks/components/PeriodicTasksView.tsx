import { useEffect, useMemo, useState } from 'react';
import {
  createPeriodicTask,
  createPeriodicTaskConstraint,
  deletePeriodicTask,
  deletePeriodicTaskConstraint,
  getPeriodicTasks,
  updatePeriodicTask,
  type PeriodicTask,
  type PeriodicTaskConstraint,
  type PeriodicTaskInput
} from '../api';

const DAY_OPTIONS = [
  [1, 'Seg'],
  [2, 'Ter'],
  [3, 'Qua'],
  [4, 'Qui'],
  [5, 'Sex'],
  [6, 'Sab'],
  [7, 'Dom']
] as const;

const EMPTY_FORM = {
  title: '',
  notes: '',
  tags: '',
  priority: 2,
  estimatedMinutes: 60,
  period: 'week' as 'week' | 'month',
  targetCount: 1,
  active: true,
  allowedDays: [] as number[],
  windowStart: '',
  windowEnd: '',
  minSpacingHours: 0,
  maxOnePerDay: false
};

const EMPTY_CONSTRAINT_DRAFT = {
  type: 'allowed_window' as PeriodicTaskConstraint['type'],
  date: '',
  start: '',
  end: '',
  count: 1,
  hard: true
};

type PeriodicTasksViewProps = {
  onError: (message: string) => void;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function dayLabels(days: number[] = []) {
  return days.map((day) => DAY_OPTIONS.find(([value]) => value === day)?.[1] || String(day)).join(', ');
}

function formatPeriod(period: PeriodicTask['period']) {
  return period === 'week' ? 'semana' : 'mes';
}

function formatDate(value: unknown) {
  if (typeof value !== 'string' || !value) return '';
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function formatTimeRange(start?: unknown, end?: unknown) {
  const startText = typeof start === 'string' ? start.slice(0, 5) : '';
  const endText = typeof end === 'string' ? end.slice(0, 5) : '';
  return startText && endText ? `${startText}-${endText}` : 'sem hora';
}

function formFromTask(task: PeriodicTask) {
  const firstWindow = task.hardConstraints.allowedWindows?.[0] || { startTime: '', endTime: '' };
  return {
    title: task.title,
    notes: task.notes,
    tags: task.tags.join(', '),
    priority: task.priority,
    estimatedMinutes: task.estimatedMinutes,
    period: task.period,
    targetCount: task.targetCount,
    active: task.active,
    allowedDays: task.hardConstraints.allowedDays || [],
    windowStart: firstWindow.startTime || '',
    windowEnd: firstWindow.endTime || '',
    minSpacingHours: Number(task.hardConstraints.minSpacingHours || 0),
    maxOnePerDay: Number(task.hardConstraints.maxOccurrencesPerDay || 0) === 1
  };
}

function taskInputFromForm(form: typeof EMPTY_FORM): PeriodicTaskInput {
  return {
    title: form.title.trim(),
    notes: form.notes.trim(),
    tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
    priority: form.priority,
    estimatedMinutes: form.estimatedMinutes,
    period: form.period,
    targetCount: form.targetCount,
    active: form.active,
    hardConstraints: {
      allowedDays: form.allowedDays,
      allowedWindows: form.windowStart && form.windowEnd ? [{ startTime: form.windowStart, endTime: form.windowEnd }] : [],
      minSpacingHours: form.minSpacingHours || 0,
      maxOccurrencesPerDay: form.maxOnePerDay ? 1 : 0
    },
    preferences: {}
  };
}

function describeConstraint(constraint: PeriodicTaskConstraint) {
  const scope = constraint.scope || {};
  const payload = constraint.payload || {};
  if (constraint.type === 'fixed_occurrence') {
    return {
      title: 'Ocorrencia fixa',
      detail: `${formatDate(payload.start)} ${formatTimeRange(payload.start, payload.end)}`,
      meta: 'Obrigatoria'
    };
  }
  if (constraint.type === 'allowed_window') {
    return {
      title: 'Janela permitida',
      detail: `${formatDate(payload.date || scope.date)} ${formatTimeRange(payload.startTime, payload.endTime)}`,
      meta: constraint.hard ? 'Obrigatoria' : 'Preferida'
    };
  }
  return {
    title: 'Minimo no periodo',
    detail: `${Number(payload.count || 1)} ocorrencia(s)${scope.weekStart ? ` na semana de ${formatDate(scope.weekStart)}` : ''}${scope.month ? ` em ${scope.month}` : ''}`,
    meta: constraint.hard ? 'Obrigatorio' : 'Preferido'
  };
}

function ConstraintComposer({
  task,
  onCreate
}: {
  task: PeriodicTask;
  onCreate: (taskId: string, value: Partial<PeriodicTaskConstraint>) => Promise<void>;
}) {
  const [draft, setDraft] = useState(EMPTY_CONSTRAINT_DRAFT);

  function update(patch: Partial<typeof EMPTY_CONSTRAINT_DRAFT>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  async function submit() {
    if (draft.type === 'minimum_count') {
      if (!draft.date) return;
      await onCreate(task.id, {
        type: draft.type,
        scope: task.period === 'month' ? { month: draft.date.slice(0, 7) } : { weekStart: draft.date },
        payload: { count: draft.count },
        hard: draft.hard,
        active: true
      });
      setDraft(EMPTY_CONSTRAINT_DRAFT);
      return;
    }
    if (!draft.date || !draft.start || !draft.end) return;
    await onCreate(task.id, {
      type: draft.type,
      scope: { date: draft.date },
      payload: draft.type === 'fixed_occurrence'
        ? { start: `${draft.date}T${draft.start}:00`, end: `${draft.date}T${draft.end}:00` }
        : { date: draft.date, startTime: draft.start, endTime: draft.end },
      hard: draft.hard,
      active: true
    });
    setDraft(EMPTY_CONSTRAINT_DRAFT);
  }

  return (
    <section className="periodic-rule-editor">
      <div className="periodic-rule-editor-header">
        <strong>Restricoes adicionais</strong>
        <span>Excecoes ou regras especificas desta rotina.</span>
      </div>
      <div className="periodic-rule-grid">
        <label>
          Tipo
          <select value={draft.type} onChange={(event) => update({ type: event.target.value as PeriodicTaskConstraint['type'] })}>
            <option value="allowed_window">Janela permitida</option>
            <option value="fixed_occurrence">Ocorrencia fixa</option>
            <option value="minimum_count">Minimo no periodo</option>
          </select>
        </label>
        <label>
          {draft.type === 'minimum_count' && task.period === 'month' ? 'Mes de referencia' : 'Data'}
          <input type="date" value={draft.date} onChange={(event) => update({ date: event.target.value })} />
        </label>
        {draft.type === 'minimum_count' ? (
          <label>
            Minimo
            <input type="number" min="1" max="31" value={draft.count} onChange={(event) => update({ count: Number(event.target.value) })} />
          </label>
        ) : (
          <>
            <label>
              Inicio
              <input type="time" value={draft.start} onChange={(event) => update({ start: event.target.value })} />
            </label>
            <label>
              Fim
              <input type="time" value={draft.end} onChange={(event) => update({ end: event.target.value })} />
            </label>
          </>
        )}
        <label className="periodic-toggle">
          <input type="checkbox" checked={draft.hard} onChange={(event) => update({ hard: event.target.checked })} />
          Obrigatoria
        </label>
        <button type="button" className="button secondary small" onClick={submit}>Adicionar</button>
      </div>
    </section>
  );
}

export default function PeriodicTasksView({ onError }: PeriodicTasksViewProps) {
  const [tasks, setTasks] = useState<PeriodicTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);

  const editingTask = useMemo(() => tasks.find((task) => task.id === editingId) || null, [tasks, editingId]);

  async function refresh() {
    setLoading(true);
    try {
      setTasks(await getPeriodicTasks());
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  function toggleDay(day: number) {
    setForm((current) => ({
      ...current,
      allowedDays: current.allowedDays.includes(day)
        ? current.allowedDays.filter((item) => item !== day)
        : [...current.allowedDays, day].sort((left, right) => left - right)
    }));
  }

  async function save() {
    try {
      const input = taskInputFromForm(form);
      if (editingId) {
        const updated = await updatePeriodicTask(editingId, input);
        setTasks((current) => current.map((task) => task.id === updated.id ? updated : task));
      } else {
        const created = await createPeriodicTask(input);
        setTasks((current) => [created, ...current]);
      }
      setEditingId('');
      setForm(EMPTY_FORM);
    } catch (error) {
      onError(errorMessage(error));
    }
  }

  async function removeTask(task: PeriodicTask) {
    if (!window.confirm(`Apagar rotina "${task.title}"?`)) return;
    try {
      await deletePeriodicTask(task.id);
      setTasks((current) => current.filter((item) => item.id !== task.id));
    } catch (error) {
      onError(errorMessage(error));
    }
  }

  async function toggleActive(task: PeriodicTask) {
    try {
      const updated = await updatePeriodicTask(task.id, { active: !task.active });
      setTasks((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (error) {
      onError(errorMessage(error));
    }
  }

  async function addConstraint(taskId: string, value: Partial<PeriodicTaskConstraint>) {
    try {
      await createPeriodicTaskConstraint(taskId, value);
      await refresh();
    } catch (error) {
      onError(errorMessage(error));
    }
  }

  async function removeConstraint(id: string) {
    try {
      await deletePeriodicTaskConstraint(id);
      await refresh();
    } catch (error) {
      onError(errorMessage(error));
    }
  }

  return (
    <section className="periodic-view">
      <header className="periodic-header">
        <div>
          <span>Rotinas</span>
          <h2>Tarefas periodicas</h2>
          <p>Templates reutilizaveis para estudo, ginasio e outras rotinas que podem entrar no agendamento.</p>
        </div>
        <button type="button" className="button secondary small" onClick={refresh} disabled={loading}>
          {loading ? 'A carregar...' : 'Atualizar'}
        </button>
      </header>

      <section className="periodic-editor">
        <div className="periodic-editor-title">
          <h3>{editingTask ? `Editar ${editingTask.title}` : 'Nova rotina'}</h3>
          <label className="periodic-toggle"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Ativa</label>
        </div>

        <div className="periodic-editor-section">
          <strong>Base</strong>
          <div className="periodic-form-grid">
            <label>Titulo<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
            <label>Tags<input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="coding, saude" /></label>
            <label className="periodic-notes-field">Notas<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={2} /></label>
            <label>Prioridade<input type="number" min="1" max="4" value={form.priority} onChange={(event) => setForm({ ...form, priority: Number(event.target.value) })} /></label>
            <label>Duracao<input type="number" min="15" max="480" step="15" value={form.estimatedMinutes} onChange={(event) => setForm({ ...form, estimatedMinutes: Number(event.target.value) })} /></label>
            <label>Periodo<select value={form.period} onChange={(event) => setForm({ ...form, period: event.target.value as 'week' | 'month' })}><option value="week">Semana</option><option value="month">Mes</option></select></label>
            <label>Alvo<input type="number" min="1" max="31" value={form.targetCount} onChange={(event) => setForm({ ...form, targetCount: Number(event.target.value) })} /></label>
          </div>
        </div>

        <div className="periodic-editor-section">
          <strong>Janela obrigatoria</strong>
          <div className="periodic-days" aria-label="Dias permitidos">
            {DAY_OPTIONS.map(([day, label]) => (
              <button key={day} type="button" className={form.allowedDays.includes(day) ? 'active' : ''} onClick={() => toggleDay(day)}>
                {label}
              </button>
            ))}
          </div>
          <div className="periodic-window-grid">
            <label>Inicio<input type="time" value={form.windowStart} onChange={(event) => setForm({ ...form, windowStart: event.target.value })} /></label>
            <label>Fim<input type="time" value={form.windowEnd} onChange={(event) => setForm({ ...form, windowEnd: event.target.value })} /></label>
            <button type="button" className="button ghost small" onClick={() => setForm({ ...form, windowStart: '', windowEnd: '' })}>Limpar janela</button>
          </div>
        </div>

        <div className="periodic-editor-section">
          <strong>Distribuicao</strong>
          <div className="periodic-window-grid">
            <label>Espacamento minimo<input type="number" min="0" max="168" value={form.minSpacingHours} onChange={(event) => setForm({ ...form, minSpacingHours: Number(event.target.value) })} /></label>
            <label className="periodic-toggle"><input type="checkbox" checked={form.maxOnePerDay} onChange={(event) => setForm({ ...form, maxOnePerDay: event.target.checked })} /> Max. 1 ocorrencia por dia</label>
          </div>
        </div>

        <div className="periodic-editor-actions">
          <button type="button" className="button primary" onClick={save} disabled={!form.title.trim()}>Guardar rotina</button>
          {editingId && <button type="button" className="button secondary" onClick={() => { setEditingId(''); setForm(EMPTY_FORM); }}>Cancelar</button>}
        </div>
      </section>

      {loading ? <div className="loading">A carregar rotinas...</div> : (
        <div className="periodic-list">
          {tasks.map((task) => (
            <article className="periodic-card" key={task.id}>
              <header>
                <div>
                  <span>{task.active ? 'Ativa' : 'Pausada'}</span>
                  <h3>{task.title}</h3>
                  <p>{task.targetCount}x por {formatPeriod(task.period)} - {task.estimatedMinutes} min - P{task.priority}</p>
                </div>
                <div className="periodic-card-actions">
                  <button type="button" className="button ghost small" onClick={() => { setEditingId(task.id); setForm(formFromTask(task)); }}>Editar</button>
                  <button type="button" className="button secondary small" onClick={() => toggleActive(task)}>{task.active ? 'Pausar' : 'Ativar'}</button>
                  <button type="button" className="button ghost small" onClick={() => removeTask(task)}>Apagar</button>
                </div>
              </header>

              <div className="periodic-summary">
                <span>Dias: {dayLabels(task.hardConstraints.allowedDays || []) || 'qualquer'}</span>
                <span>Janela: {task.hardConstraints.allowedWindows?.[0] ? `${task.hardConstraints.allowedWindows[0].startTime}-${task.hardConstraints.allowedWindows[0].endTime}` : 'sem janela'}</span>
                <span>Espaco: {task.hardConstraints.minSpacingHours || 0}h</span>
                <span>Limite diario: {Number(task.hardConstraints.maxOccurrencesPerDay || 0) === 1 ? 'max. 1' : 'sem limite'}</span>
              </div>

              <ConstraintComposer task={task} onCreate={addConstraint} />

              {task.constraints.length ? (
                <ul className="periodic-constraints">
                  {task.constraints.map((constraint) => {
                    const description = describeConstraint(constraint);
                    return (
                      <li key={constraint.id}>
                        <div>
                          <span>{description.title}</span>
                          <p>{description.detail}</p>
                        </div>
                        <small>{description.meta}</small>
                        <button type="button" onClick={() => removeConstraint(constraint.id)}>Remover</button>
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="periodic-empty-note">Sem restricoes adicionais.</p>}
            </article>
          ))}
          {!tasks.length && <p className="empty-message">Ainda nao existem rotinas.</p>}
        </div>
      )}
    </section>
  );
}

