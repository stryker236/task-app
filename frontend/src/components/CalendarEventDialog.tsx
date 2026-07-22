import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, MouseEvent } from 'react';
import type { GoogleCalendar, Task, TaskCalendarEvent } from '../../../shared/types';
import { createGoogleCalendarEvent } from '../features/calendar/api';

type CalendarEventDialogProps = {
  task: Task;
  calendars: GoogleCalendar[];
  defaultCalendarId: string;
  onClose: () => void;
  onCreated: (event: TaskCalendarEvent) => void;
  onError: (message: string) => void;
};

function stopDialogMouseDown(event: MouseEvent<HTMLElement>) {
  event.stopPropagation();
}

function toDatetimeLocalValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString();
  return local.slice(0, 16);
}

function fromDatetimeLocalValue(value: string) {
  return new Date(value).toISOString();
}

function nextUsefulStart(task: Task) {
  const dueTime = task.dueDateTime ? Date.parse(task.dueDateTime) : Number.NaN;
  if (!Number.isNaN(dueTime) && dueTime > Date.now()) return new Date(dueTime);

  const date = new Date();
  date.setMinutes(date.getMinutes() <= 30 ? 30 : 60, 0, 0);
  if (date.getHours() < 9) date.setHours(9, 0, 0, 0);
  if (date.getHours() >= 18) {
    date.setDate(date.getDate() + 1);
    date.setHours(9, 0, 0, 0);
  }
  return date;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export default function CalendarEventDialog({
  task,
  calendars,
  defaultCalendarId,
  onClose,
  onCreated,
  onError
}: CalendarEventDialogProps) {
  const initialStart = useMemo(() => nextUsefulStart(task), [task]);
  const durationMinutes = Math.max(15, Math.min(240, Number(task.estimatedMinutes || 30) || 30));
  const [summary] = useState(task.title);
  const [calendarId, setCalendarId] = useState(defaultCalendarId || calendars.find((calendar) => calendar.primary)?.id || calendars[0]?.id || 'primary');
  const [start, setStart] = useState(() => toDatetimeLocalValue(initialStart));
  const [end, setEnd] = useState(() => toDatetimeLocalValue(new Date(initialStart.getTime() + durationMinutes * 60000)));
  const [description, setDescription] = useState(task.notes || '');
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCalendarId(defaultCalendarId || calendars.find((calendar) => calendar.primary)?.id || calendars[0]?.id || 'primary');
  }, [calendars, defaultCalendarId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await createGoogleCalendarEvent({
        taskId: task.id,
        summary,
        calendarId,
        description,
        location,
        start: fromDatetimeLocalValue(start),
        end: fromDatetimeLocalValue(end)
      });
      onCreated(result.event);
      onClose();
    } catch (requestError) {
      onError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="dialog calendar-event-dialog" role="dialog" aria-modal="true" onMouseDown={stopDialogMouseDown}>
        <div className="dialog-header">
          <div>
            <h2>Criar evento</h2>
            <p>Proposta editavel para Google Calendar</p>
          </div>
          <button type="button" className="icon-button" aria-label="Fechar" onClick={onClose}>x</button>
        </div>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label className="full">
              Titulo
              <input value={summary} readOnly />
            </label>
            <label className="full">
              Calendario
              <select value={calendarId} onChange={(event) => setCalendarId(event.target.value)}>
                {calendars.length ? calendars.map((calendar) => (
                  <option key={calendar.id} value={calendar.id}>{calendar.summary}</option>
                )) : <option value="primary">Primary</option>}
              </select>
            </label>
            <label>
              Inicio
              <input type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} required />
            </label>
            <label>
              Fim
              <input type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} required />
            </label>
            <label className="full">
              Descricao
              <textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} />
            </label>
            <label className="full">
              Local
              <input value={location} onChange={(event) => setLocation(event.target.value)} />
            </label>
          </div>
          <div className="dialog-actions">
            <button type="button" className="button secondary" onClick={onClose} disabled={saving}>Cancelar</button>
            <button type="submit" className="button primary" disabled={saving || !start || !end || !calendarId}>
              {saving ? 'A criar...' : 'Criar evento'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
