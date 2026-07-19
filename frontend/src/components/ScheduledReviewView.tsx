import { useMemo, useState } from 'react';
import type { Task, TaskCalendarEvent, TaskCalendarEventReviewStatus } from '../../../shared/types';
import { pendingScheduledReviewEvents } from '../utils/taskScheduling';

const REVIEW_REASONS = [
  { id: 'woke_up_late', label: 'Acordei tarde' },
  { id: 'took_longer', label: 'Demorou mais' },
  { id: 'bad_time', label: 'Horario nao era bom' },
  { id: 'low_energy', label: 'Pouca energia' },
  { id: 'blocked_dependency', label: 'Dependencia bloqueou' },
  { id: 'priority_changed', label: 'Prioridade mudou' },
  { id: 'external_event', label: 'Evento externo interferiu' }
];

function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(new Date(value));
}

type ReviewItem = {
  task: Task;
  event: TaskCalendarEvent;
};

type ScheduledReviewViewProps = {
  tasks: Task[];
  loading: boolean;
  onOpenTask: (task: Task) => void;
  onReview: (task: Task, event: TaskCalendarEvent, status: TaskCalendarEventReviewStatus, note: string, feedback: Record<string, unknown>) => Promise<Task | null>;
};

export default function ScheduledReviewView({ tasks, loading, onOpenTask, onReview }: ScheduledReviewViewProps) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [reasonsByEvent, setReasonsByEvent] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState('');
  const items = useMemo<ReviewItem[]>(() => tasks.flatMap((task) => pendingScheduledReviewEvents(task).map((event) => ({ task, event }))), [tasks]);

  function toggleReason(eventId: string, reasonId: string) {
    setReasonsByEvent((current) => {
      const selected = new Set(current[eventId] || []);
      if (selected.has(reasonId)) selected.delete(reasonId);
      else selected.add(reasonId);
      return { ...current, [eventId]: [...selected] };
    });
  }

  async function submit(item: ReviewItem, status: TaskCalendarEventReviewStatus, options: { reschedule?: boolean } = {}) {
    if (saving) return;
    setSaving(item.event.id);
    try {
      const reasonIds = reasonsByEvent[item.event.id] || [];
      const note = notes[item.event.id] || '';
      const feedback = {
        source: 'scheduled_review',
        reasons: reasonIds,
        reasonLabels: REVIEW_REASONS.filter((reason) => reasonIds.includes(reason.id)).map((reason) => reason.label),
        rescheduleRequested: Boolean(options.reschedule)
      };
      const updated = await onReview(item.task, item.event, status, note, feedback);
      if (updated) {
        setNotes((current) => ({ ...current, [item.event.id]: '' }));
        setReasonsByEvent((current) => ({ ...current, [item.event.id]: [] }));
        if (options.reschedule) onOpenTask(updated);
      }
    } finally {
      setSaving('');
    }
  }

  if (loading) return <div className="loading">A carregar revisoes...</div>;

  return (
    <section className="scheduled-review-view">
      <header className="section-heading">
        <div>
          <h2>A rever</h2>
          <p>{items.length} evento{items.length === 1 ? '' : 's'} agendado{items.length === 1 ? '' : 's'} por confirmar</p>
        </div>
      </header>
      {items.length ? (
        <div className="scheduled-review-list">
          {items.map((item) => {
            const selectedReasons = reasonsByEvent[item.event.id] || [];
            const isSaving = saving === item.event.id;
            return (
              <article className="scheduled-review-item" key={item.event.id}>
                <div>
                  <button type="button" className="link-button" onClick={() => onOpenTask(item.task)}>{item.task.title}</button>
                  <p>{formatDate(item.event.start)} - {formatDate(item.event.end)}</p>
                  <small>Calendario: {item.event.calendarId}</small>
                  {item.task.dueDateTime && <small>Prazo: {formatDate(item.task.dueDateTime)}</small>}
                </div>
                <div className="scheduled-review-feedback">
                  <span>Motivos</span>
                  <div>
                    {REVIEW_REASONS.map((reason) => (
                      <label key={reason.id}>
                        <input
                          type="checkbox"
                          checked={selectedReasons.includes(reason.id)}
                          onChange={() => toggleReason(item.event.id, reason.id)}
                        />
                        {reason.label}
                      </label>
                    ))}
                  </div>
                </div>
                <textarea
                  rows={3}
                  value={notes[item.event.id] || ''}
                  placeholder="Notas sobre o que aconteceu..."
                  onChange={(event) => setNotes((current) => ({ ...current, [item.event.id]: event.target.value }))}
                />
                <div className="scheduled-review-actions">
                  {item.event.htmlLink && <a className="button secondary small" href={item.event.htmlLink} target="_blank" rel="noreferrer">Abrir Google</a>}
                  <button type="button" className="button secondary small" disabled={isSaving} onClick={() => onOpenTask(item.task)}>Abrir task</button>
                  <button type="button" className="button secondary small" disabled={isSaving} onClick={() => submit(item, 'skipped')}>Ignorar</button>
                  <button type="button" className="button secondary small" disabled={isSaving} onClick={() => submit(item, 'missed')}>Nao ficou feita</button>
                  <button type="button" className="button secondary small" disabled={isSaving} onClick={() => submit(item, 'missed', { reschedule: true })}>Reagendar</button>
                  <button type="button" className="button small" disabled={isSaving} onClick={() => submit(item, 'completed')}>Feita</button>
                </div>
              </article>
            );
          })}
        </div>
      ) : <p className="empty-column">Sem tarefas agendadas por rever.</p>}
    </section>
  );
}
