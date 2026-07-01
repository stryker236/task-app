import type { GoogleCalendar, GoogleCalendarEvent, GoogleStatus } from '../../../shared/types';

type CalendarWeekViewProps = {
  status: GoogleStatus;
  loading: boolean;
  weekStart: string;
  weekEnd: string;
  events: GoogleCalendarEvent[];
  calendars: GoogleCalendar[];
  selectedCalendarIds: string[];
  accountEmail: string | null;
  busyCount: number;
  onWeekChange: (date: string) => void;
  onCalendarFilterChange: (calendarIds: string[]) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onLoadEvents: (date: string, calendarIds?: string[]) => void;
};

function dateFromInputValue(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
}

function inputValueFromDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(value: string, days: number) {
  const date = dateFromInputValue(value);
  date.setDate(date.getDate() + days);
  return inputValueFromDate(date);
}

function dateKeyFromEventValue(value: string | null) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return inputValueFromDate(date);
}

function formatDayLabel(value: string) {
  return new Intl.DateTimeFormat('pt-PT', {
    weekday: 'short',
    day: '2-digit',
    month: 'short'
  }).format(dateFromInputValue(value));
}

function formatWeekRange(start: string, end: string) {
  const formatter = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
  return `${formatter.format(dateFromInputValue(start))} - ${formatter.format(dateFromInputValue(end))}`;
}

function formatEventTime(value: string | null) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Dia todo';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-PT', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}

function groupEventsByDay(days: string[], events: GoogleCalendarEvent[]) {
  const grouped = new Map(days.map((day) => [day, [] as GoogleCalendarEvent[]]));
  events.forEach((event) => {
    const key = dateKeyFromEventValue(event.start);
    grouped.get(key)?.push(event);
  });
  return grouped;
}

function toggleCalendarId(calendarIds: string[], calendarId: string) {
  return calendarIds.includes(calendarId)
    ? calendarIds.filter((id) => id !== calendarId)
    : [...calendarIds, calendarId];
}

export default function CalendarWeekView({
  status,
  loading,
  weekStart,
  weekEnd,
  events,
  calendars,
  selectedCalendarIds,
  accountEmail,
  busyCount,
  onWeekChange,
  onCalendarFilterChange,
  onConnect,
  onDisconnect,
  onLoadEvents
}: CalendarWeekViewProps) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const groupedEvents = groupEventsByDay(days, events);

  return (
    <section className="calendar-week-view" aria-label="Google Calendar semanal">
      <header className="calendar-week-header">
        <div>
          <span>Google Calendar</span>
          <h2>Calendario semanal</h2>
          <p>
            {status.connected
              ? `${formatWeekRange(weekStart, weekEnd)} · ${busyCount} eventos · ${accountEmail || status.accountEmail || 'Google'}`
              : 'Liga o Google Calendar para consultar a tua semana.'}
          </p>
        </div>
        <div className="calendar-week-actions">
          {status.connected ? (
            <button type="button" className="button secondary small" onClick={onDisconnect} disabled={loading}>
              Desligar Google
            </button>
          ) : (
            <button type="button" className="button primary small" onClick={onConnect} disabled={loading}>
              Ligar Google Calendar
            </button>
          )}
        </div>
      </header>

      {status.connected && (
        <>
          <div className="calendar-week-controls">
            <button type="button" className="button secondary small" onClick={() => onLoadEvents(addDays(weekStart, -7))} disabled={loading}>
              Semana anterior
            </button>
            <label>
              Semana
              <input
                type="date"
                value={weekStart}
                onChange={(event) => {
                  onWeekChange(event.target.value);
                  onLoadEvents(event.target.value);
                }}
              />
            </label>
            <button type="button" className="button secondary small" onClick={() => onLoadEvents(addDays(weekStart, 7))} disabled={loading}>
              Semana seguinte
            </button>
            <button type="button" className="button primary small" onClick={() => onLoadEvents(weekStart)} disabled={loading}>
              {loading ? 'A carregar...' : 'Atualizar'}
            </button>
          </div>

          <div className="calendar-filter-bar" aria-label="Filtrar calendarios">
            <div>
              <strong>Calendarios</strong>
              <span>{selectedCalendarIds.length} de {calendars.length} ativos</span>
            </div>
            <div className="calendar-filter-options">
              <button
                type="button"
                className="button secondary small"
                onClick={() => onCalendarFilterChange(calendars.map((calendar) => calendar.id))}
                disabled={loading || selectedCalendarIds.length === calendars.length}
              >
                Todos
              </button>
              <button
                type="button"
                className="button ghost small"
                onClick={() => onCalendarFilterChange([])}
                disabled={loading || selectedCalendarIds.length === 0}
              >
                Limpar
              </button>
              {calendars.map((calendar) => (
                <label className="calendar-filter-option" key={calendar.id}>
                  <input
                    type="checkbox"
                    checked={selectedCalendarIds.includes(calendar.id)}
                    onChange={() => onCalendarFilterChange(toggleCalendarId(selectedCalendarIds, calendar.id))}
                  />
                  <span style={{ backgroundColor: calendar.backgroundColor || undefined }} aria-hidden="true" />
                  {calendar.summary}
                </label>
              ))}
            </div>
          </div>

          <div className="calendar-week-grid">
            {days.map((day) => {
              const dayEvents = groupedEvents.get(day) || [];
              return (
                <article className="calendar-day" key={day}>
                  <header>
                    <time dateTime={day}>{formatDayLabel(day)}</time>
                    <span>{dayEvents.length}</span>
                  </header>
                  {dayEvents.length ? (
                    <ol>
                      {dayEvents.map((event) => (
                        <li key={event.id}>
                          <time>{formatEventTime(event.start)}{event.end ? ` - ${formatEventTime(event.end)}` : ''}</time>
                          <span className="calendar-event-source">
                            <i style={{ backgroundColor: event.calendarColor || undefined }} aria-hidden="true" />
                            {event.calendarSummary}
                          </span>
                          {event.htmlLink ? (
                            <a href={event.htmlLink} target="_blank" rel="noreferrer">{event.summary}</a>
                          ) : (
                            <strong>{event.summary}</strong>
                          )}
                          {event.location && <span>{event.location}</span>}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p>Sem eventos</p>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
