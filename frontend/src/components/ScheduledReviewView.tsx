import { useMemo, useState } from 'react';
import type { Task, TaskCalendarEvent, TaskCalendarEventReviewStatus } from '../../../shared/types';
import { pendingScheduledReviewEvents } from '../utils/taskScheduling';

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
  const [saving, setSaving] = useState('');
  const items = useMemo<ReviewItem[]>(() => tasks.flatMap((task) => pendingScheduledReviewEvents(task).map((event) => ({ task, event }))), [tasks]);

  async function submit(item: ReviewItem, status: TaskCalendarEventReviewStatus) {
    if (saving) return;
    setSaving(item.event.id);
    const note = notes[item.event.id] || '';
    const feedback = { source: 'scheduled_review' };
    const updated = await onReview(item.task, item.event, status, note, feedback);
    if (updated) setNotes((current) => ({ ...current, [item.event.id]: '' }));
    setSaving('');
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
          {items.map((item) => (
            <article className="scheduled-review-item" key={item.event.id}>
              <div>
                <button type="button" className="link-button" onClick={() => onOpenTask(item.task)}>{item.task.title}</button>
                <p>{formatDate(item.event.start)} - {formatDate(item.event.end)}</p>
                {item.task.dueDateTime && <small>Prazo: {formatDate(item.task.dueDateTime)}</small>}
              </div>
              <textarea
                rows={3}
                value={notes[item.event.id] || ''}
                placeholder="Notas sobre o que aconteceu..."
                onChange={(event) => setNotes((current) => ({ ...current, [item.event.id]: event.target.value }))}
              />
              <div className="scheduled-review-actions">
                {item.event.htmlLink && <a className="button secondary small" href={item.event.htmlLink} target="_blank" rel="noreferrer">Abrir Google</a>}
                <button type="button" className="button secondary small" disabled={saving === item.event.id} onClick={() => submit(item, 'missed')}>Nao ficou feita</button>
                <button type="button" className="button small" disabled={saving === item.event.id} onClick={() => submit(item, 'completed')}>Feita</button>
              </div>
            </article>
          ))}
        </div>
      ) : <p className="empty-column">Sem tarefas agendadas por rever.</p>}
    </section>
  );
}