import { useEffect, useMemo, useState } from 'react';
import {
  createPeriodicTask,
  createPeriodicTaskConstraint,
  deletePeriodicTask,
  deletePeriodicTaskConstraint,
  getPeriodicTasks,
  updatePeriodicTask,
  updatePeriodicTaskOccurrence,
  type PeriodicTask,
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
  minSpacingHours: 0
};

type PeriodicTasksViewProps = {
  onError: (message: string) => void;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}

function dayLabels(days: number[] = []) {
  return days.map((day) => DAY_OPTIONS.find(([value]) => value === day)?.[1] || String(day)).join(', ');
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
    minSpacingHours: Number(task.hardConstraints.minSpacingHours || 0)
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
      minSpacingHours: form.minSpacingHours || 0
    },
    preferences: {}
  };
}

function ConstraintComposer({
  task,
  onCreate
}: {
  task: PeriodicTask;
  onCreate: (taskId: string, value: Record<string, unknown>) => void;
}) {
  const [type, setType] = useState<'fixed_occurrence' | 'allowed_window' | 'minimum_count'>('fixed_occurrence');
  const [date, setDate] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [count, setCount] = useState(1);

  function submit() {
    if (type === 'minimum_count') {
      onCreate(task.id, {
        type,
        scope: task.period === 'month' ? { month: date.slice(0, 7) } : { weekStart: date },
        payload: { count },
        hard: true,
        active: true
      });
      return;
    }
    if (!date || !start || !end) return;
    onCreate(task.id, {
      type,
      scope: { date },
      payload: type === 'fixed_occurrence'
        ? { start: `${date}T${start}:00`, end: `${date}T${end}:00` }
        : { date, startTime: start, endTime: end },
      hard: true,
      active: true
    });
  }

  return (
    <div className="periodic-constraint-composer">
      <select value={type} onChange={(event) => setType(event.target.value as typeof type)}>
        <option value="fixed_occurrence">Fixo</option>
        <option value="allowed_window">Janela</option>
        <option value="minimum_count">Minimo</option>
      </select>
      <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      {type === 'minimum_count' ? (
        <input type="number" min="1" max="31" value={count} onChange={(event) => setCount(Number(event.target.value))} />
      ) : (
        <>
          <input type="time" value={start} onChange={(event) => setStart(event.target.value)} />
          <input type="time" value={end} onChange={(event) => setEnd(event.target.value)} />
        </>
      )}
      <button type="button" className="button secondary small" onClick={submit}>Adicionar regra</button>
    </div>
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

  async function addConstraint(taskId: string, value: Record<string, unknown>) {
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

  async function setOccurrenceStatus(id: string, status: 'scheduled' | 'completed' | 'skipped' | 'cancelled') {
    try {
      await updatePeriodicTaskOccurrence(id, status);
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
        <h3>{editingTask ? `Editar ${editingTask.title}` : 'Nova rotina'}</h3>
        <div className="periodic-form-grid">
          <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Titulo" />
          <input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="tags, separadas, por virgula" />
          <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Notas" rows={2} />
          <label>Prioridade<input type="number" min="1" max="4" value={form.priority} onChange={(event) => setForm({ ...form, priority: Number(event.target.value) })} /></label>
          <label>Duracao<input type="number" min="15" max="480" step="15" value={form.estimatedMinutes} onChange={(event) => setForm({ ...form, estimatedMinutes: Number(event.target.value) })} /></label>
          <label>Periodo<select value={form.period} onChange={(event) => setForm({ ...form, period: event.target.value as 'week' | 'month' })}><option value="week">Semana</option><option value="month">Mes</option></select></label>
          <label>Alvo<input type="number" min="1" max="31" value={form.targetCount} onChange={(event) => setForm({ ...form, targetCount: Number(event.target.value) })} /></label>
          <label>Espacamento minimo<input type="number" min="0" max="168" value={form.minSpacingHours} onChange={(event) => setForm({ ...form, minSpacingHours: Number(event.target.value) })} /></label>
          <label>Inicio janela<input type="time" value={form.windowStart} onChange={(event) => setForm({ ...form, windowStart: event.target.value })} /></label>
          <label>Fim janela<input type="time" value={form.windowEnd} onChange={(event) => setForm({ ...form, windowEnd: event.target.value })} /></label>
        </div>
        <div className="periodic-days">
          {DAY_OPTIONS.map(([day, label]) => (
            <button key={day} type="button" className={form.allowedDays.includes(day) ? 'active' : ''} onClick={() => toggleDay(day)}>
              {label}
            </button>
          ))}
        </div>
        <label className="periodic-active"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} /> Ativa</label>
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
                  <p>{task.targetCount}x por {task.period === 'week' ? 'semana' : 'mes'} · {task.estimatedMinutes} min · P{task.priority}</p>
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
              </div>
              <ConstraintComposer task={task} onCreate={addConstraint} />
              {task.constraints.length ? (
                <ul className="periodic-constraints">
                  {task.constraints.map((constraint) => (
                    <li key={constraint.id}>
                      <span>{constraint.type}</span>
                      <code>{JSON.stringify({ scope: constraint.scope, payload: constraint.payload })}</code>
                      <button type="button" onClick={() => removeConstraint(constraint.id)}>Remover</button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="periodic-occurrences">
                <strong>Historico</strong>
                {task.occurrences.slice(0, 6).map((occurrence) => (
                  <div key={occurrence.id}>
                    <span>{formatDateTime(occurrence.scheduledStart)} - {formatDateTime(occurrence.scheduledEnd)}</span>
                    <select value={occurrence.status} onChange={(event) => setOccurrenceStatus(occurrence.id, event.target.value as any)}>
                      <option value="scheduled">scheduled</option>
                      <option value="completed">completed</option>
                      <option value="skipped">skipped</option>
                      <option value="cancelled">cancelled</option>
                    </select>
                  </div>
                ))}
                {!task.occurrences.length && <p>Sem ocorrencias agendadas.</p>}
              </div>
            </article>
          ))}
          {!tasks.length && <p className="empty-message">Ainda nao existem rotinas.</p>}
        </div>
      )}
    </section>
  );
}
