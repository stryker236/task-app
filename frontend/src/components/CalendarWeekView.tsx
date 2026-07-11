import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin, { type EventResizeDoneArg } from '@fullcalendar/interaction';
import timeGridPlugin from '@fullcalendar/timegrid';
import { useMemo, useRef, useState } from 'react';
import type { DatesSetArg, EventClickArg, EventContentArg, EventDropArg, EventInput } from '@fullcalendar/core';
import type { GoogleCalendar, GoogleCalendarEvent, GoogleStatus } from '../../../shared/types';
import type { AdvisorCalendarPreviewEvent, AdvisorReservedPreviewEvent, TaskDueDateCalendarEvent } from '../utils/advisorCalendarPreviews';

const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const CALENDAR_WRITE_SCOPE = 'https://www.googleapis.com/auth/calendar';

type CalendarDisplayEvent = GoogleCalendarEvent | AdvisorCalendarPreviewEvent | AdvisorReservedPreviewEvent | TaskDueDateCalendarEvent;

type CalendarViewMode = 'timeGridDay' | 'timeGridWeek' | 'dayGridMonth';

type CalendarWeekViewProps = {
  status: GoogleStatus;
  loading: boolean;
  weekStart: string;
  weekEnd: string;
  events: GoogleCalendarEvent[];
  advisorPreviewEvents: AdvisorCalendarPreviewEvent[];
  advisorReservedPreviewEvents: AdvisorReservedPreviewEvent[];
  taskDueDateEvents: TaskDueDateCalendarEvent[];
  calendars: GoogleCalendar[];
  selectedCalendarIds: string[];
  advisorDefaultCalendarId: string;
  accountEmail: string | null;
  busyCount: number;
  onWeekChange: (date: string) => void;
  onCalendarFilterChange: (calendarIds: string[]) => void;
  onAdvisorDefaultCalendarChange: (calendarId: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onLoadEvents: (date: string, calendarIds?: string[]) => void;
  onLoadRangeEvents: (start: string, end: string, calendarIds?: string[]) => void;
  onSendDailyTaskEmail: (date?: string) => Promise<{ to: string; date?: string; calendarSummary?: string; eventCount?: number; totalMinutes?: number; todayCount: number; overdueCount: number } | null>;
  onDeleteDefaultCalendarEvents: () => Promise<{ calendarSummary: string; deletedCount: number; unlinkedCount: number } | null>;
  advisorLoading: boolean;
  advisorConstraintCount: number;
  onRequestAdvisorCalendarEvents: () => void;
  onMoveAdvisorPreviewEvent: (taskId: string, start: string, end: string) => void;
  onClearAdvisorScheduleConstraints: () => void;
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

function formatDateRange(start: string, end: string) {
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

function eventTitle(event: CalendarDisplayEvent) {
  return event.summary || '(Sem titulo)';
}

function eventTimeRange(event: CalendarDisplayEvent) {
  const start = formatEventTime(event.start);
  const end = event.end ? formatEventTime(event.end) : '';
  return end ? `${start} - ${end}` : start;
}

function isAdvisorPreviewEvent(event: CalendarDisplayEvent): event is AdvisorCalendarPreviewEvent {
  return 'advisorPreview' in event && event.advisorPreview;
}

function isTaskDueDateEvent(event: CalendarDisplayEvent): event is TaskDueDateCalendarEvent {
  return 'taskDueDate' in event && event.taskDueDate;
}

function isAdvisorReservedPreviewEvent(event: CalendarDisplayEvent): event is AdvisorReservedPreviewEvent {
  return 'advisorReservedPreview' in event && event.advisorReservedPreview;
}

function advisorPreviewTaskId(event: AdvisorCalendarPreviewEvent) {
  return String((event as unknown as { taskId?: string }).taskId || event.advisorProposalId.replace(/^schedule_/, ''));
}

function isAllDayEvent(event: CalendarDisplayEvent) {
  return Boolean(event.start && /^\d{4}-\d{2}-\d{2}$/.test(event.start));
}

function eventDurationMinutes(event: CalendarDisplayEvent) {
  if (!event.start || !event.end) return 30;
  const start = new Date(event.start);
  const end = new Date(event.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return 30;
  return Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000));
}

function toggleCalendarId(calendarIds: string[], calendarId: string) {
  return calendarIds.includes(calendarId)
    ? calendarIds.filter((id) => id !== calendarId)
    : [...calendarIds, calendarId];
}

function eventClassNames(event: CalendarDisplayEvent) {
  return [
    isAdvisorPreviewEvent(event) ? 'is-advisor-preview' : '',
    isAdvisorReservedPreviewEvent(event) ? 'is-advisor-break-preview' : '',
    isTaskDueDateEvent(event) ? 'is-task-due-date' : ''
  ].filter(Boolean);
}

function toFullCalendarEvent(event: CalendarDisplayEvent): EventInput {
  const isPreview = isAdvisorPreviewEvent(event);
  const isBreak = isAdvisorReservedPreviewEvent(event);
  const color = event.calendarColor || (isPreview ? '#6f48eb' : isBreak ? '#b7791f' : isTaskDueDateEvent(event) ? '#0f8b8d' : '#315efb');
  return {
    id: event.id,
    title: eventTitle(event),
    start: event.start || undefined,
    end: event.end || undefined,
    allDay: isAllDayEvent(event),
    editable: isPreview,
    startEditable: isPreview,
    durationEditable: isPreview,
    backgroundColor: color,
    borderColor: color,
    classNames: eventClassNames(event),
    extendedProps: {
      calendarEvent: event
    }
  };
}

function renderEventContent(arg: EventContentArg) {
  const event = arg.event.extendedProps.calendarEvent as CalendarDisplayEvent | undefined;
  if (!event) return null;

  return (
    <div className="calendar-fc-event-content">
      <strong>{eventTitle(event)}</strong>
      <span>{eventTimeRange(event)}</span>
      {isAdvisorPreviewEvent(event) && <em>Preview</em>}
      {isAdvisorReservedPreviewEvent(event) && <em>Break</em>}
      {isTaskDueDateEvent(event) && <em>Due date</em>}
    </div>
  );
}

export default function CalendarWeekView({
  status,
  loading,
  weekStart,
  weekEnd,
  events,
  advisorPreviewEvents,
  advisorReservedPreviewEvents,
  taskDueDateEvents,
  calendars,
  selectedCalendarIds,
  advisorDefaultCalendarId,
  accountEmail,
  busyCount,
  onWeekChange,
  onCalendarFilterChange,
  onAdvisorDefaultCalendarChange,
  onConnect,
  onDisconnect,
  onLoadEvents,
  onLoadRangeEvents,
  onSendDailyTaskEmail,
  onDeleteDefaultCalendarEvents,
  advisorLoading,
  advisorConstraintCount,
  onRequestAdvisorCalendarEvents,
  onMoveAdvisorPreviewEvent,
  onClearAdvisorScheduleConstraints
}: CalendarWeekViewProps) {
  const calendarRef = useRef<FullCalendar | null>(null);
  const [calendarMode, setCalendarMode] = useState<CalendarViewMode>('timeGridWeek');
  const [visibleStart, setVisibleStart] = useState(weekStart);
  const [visibleEnd, setVisibleEnd] = useState(weekEnd);
  const [selectedDate, setSelectedDate] = useState(weekStart);
  const [emailDate, setEmailDate] = useState(() => inputValueFromDate(new Date()));
  const [selectedPreviewEvent, setSelectedPreviewEvent] = useState<AdvisorCalendarPreviewEvent | null>(null);
  const [selectedBreakEvent, setSelectedBreakEvent] = useState<AdvisorReservedPreviewEvent | null>(null);

  const visibleAdvisorPreviewEvents = advisorPreviewEvents.filter((event) => {
    const knownCalendar = calendars.some((calendar) => calendar.id === event.calendarId);
    return !knownCalendar || selectedCalendarIds.includes(event.calendarId);
  });

  const fullCalendarEvents = useMemo(
    () => [...events, ...visibleAdvisorPreviewEvents, ...advisorReservedPreviewEvents, ...taskDueDateEvents].map(toFullCalendarEvent),
    [advisorReservedPreviewEvents, events, taskDueDateEvents, visibleAdvisorPreviewEvents]
  );

  const canSendEmail = status.scopes.includes(GMAIL_SEND_SCOPE);
  const canCreateCalendarEvents = status.connected && status.scopes.includes(CALENDAR_WRITE_SCOPE);
  const visibleEventCount = events.length + visibleAdvisorPreviewEvents.length + advisorReservedPreviewEvents.length + taskDueDateEvents.length;

  function calendarApi() {
    return calendarRef.current?.getApi();
  }

  function loadVisibleRange(start: string, end: string, calendarIds = selectedCalendarIds) {
    if (calendarMode === 'timeGridDay') {
      onLoadEvents(start, calendarIds);
      return;
    }
    onLoadRangeEvents(start, end, calendarIds);
  }

  function handleDatesSet(arg: DatesSetArg) {
    const start = inputValueFromDate(arg.start);
    const exclusiveEnd = inputValueFromDate(arg.end);
    const end = addDays(exclusiveEnd, -1);
    setVisibleStart(start);
    setVisibleEnd(end);
    setSelectedDate(start);
    onWeekChange(start);
    loadVisibleRange(start, end);
  }

  function changeView(nextMode: CalendarViewMode) {
    setCalendarMode(nextMode);
    calendarApi()?.changeView(nextMode);
  }

  function changeDate(date: string) {
    setSelectedDate(date);
    calendarApi()?.gotoDate(date);
  }

  function moveCalendar(direction: 'prev' | 'next') {
    const api = calendarApi();
    if (!api) return;
    if (direction === 'prev') api.prev();
    else api.next();
  }

  function changeCalendarIds(calendarIds: string[]) {
    onCalendarFilterChange(calendarIds);
    loadVisibleRange(visibleStart, visibleEnd, calendarIds);
  }

  function handleEventClick(arg: EventClickArg) {
    const event = arg.event.extendedProps.calendarEvent as CalendarDisplayEvent | undefined;
    if (!event) return;
    if (isAdvisorPreviewEvent(event)) {
      arg.jsEvent.preventDefault();
      setSelectedPreviewEvent(event);
      return;
    }
    if (isAdvisorReservedPreviewEvent(event)) {
      arg.jsEvent.preventDefault();
      setSelectedBreakEvent(event);
      return;
    }
    if (event.htmlLink) {
      arg.jsEvent.preventDefault();
      window.open(event.htmlLink, '_blank', 'noopener,noreferrer');
    }
  }

  function handlePreviewMove(event: CalendarDisplayEvent | undefined, start: Date | null, end: Date | null, revert: () => void) {
    if (!event || !isAdvisorPreviewEvent(event) || !start) {
      revert();
      return;
    }
    const resolvedEnd = end || new Date(start.getTime() + eventDurationMinutes(event) * 60000);
    onMoveAdvisorPreviewEvent(advisorPreviewTaskId(event), start.toISOString(), resolvedEnd.toISOString());
  }

  function handleEventDrop(arg: EventDropArg) {
    handlePreviewMove(arg.event.extendedProps.calendarEvent as CalendarDisplayEvent | undefined, arg.event.start, arg.event.end, arg.revert);
  }

  function handleEventResize(arg: EventResizeDoneArg) {
    handlePreviewMove(arg.event.extendedProps.calendarEvent as CalendarDisplayEvent | undefined, arg.event.start, arg.event.end, arg.revert);
  }

  return (
    <section className="calendar-week-view" aria-label="Google Calendar">
      <header className="calendar-week-header">
        <div>
          <span>Google Calendar</span>
          <h2>Calendario</h2>
          <p>
            {status.connected
              ? `${formatDateRange(visibleStart, visibleEnd)} · ${busyCount} eventos Google · ${accountEmail || status.accountEmail || 'Google'}`
              : loading
                ? 'A verificar a ligacao Google guardada...'
                : 'Liga o Google Calendar para consultar a tua agenda.'}
          </p>
        </div>
        <div className="calendar-week-actions">
          {status.connected ? (
            <>
              {canSendEmail ? (
                <label className="calendar-email-date">
                  <span>Email do dia</span>
                  <input type="date" value={emailDate} onChange={(event) => setEmailDate(event.target.value)} />
                  <button
                    type="button"
                    className="button primary small"
                    onClick={async () => {
                      const result = await onSendDailyTaskEmail(emailDate);
                      if (result) window.alert(`Email enviado para ${result.to}. Data: ${result.date || emailDate}. Calendario: ${result.calendarSummary || 'default'}. Eventos: ${result.eventCount ?? 0}; due dates: ${result.todayCount}; atrasadas: ${result.overdueCount}.`);
                    }}
                    disabled={loading || !emailDate}
                  >
                    {loading ? 'A enviar...' : 'Enviar'}
                  </button>
                </label>
              ) : (
                <button type="button" className="button primary small" onClick={onConnect} disabled={loading}>
                  Ativar envio de email
                </button>
              )}
              <button type="button" className="button secondary small" onClick={onDisconnect} disabled={loading}>
                Desligar Google
              </button>
            </>
          ) : !loading && (
            <button type="button" className="button primary small" onClick={onConnect} disabled={loading}>
              Ligar Google Calendar
            </button>
          )}
        </div>
      </header>

      {status.connected && (
        <>
          <div className="calendar-advisor-bar">
            <div>
              <strong>AIAdvisor</strong>
              <span>{visibleAdvisorPreviewEvents.length || advisorReservedPreviewEvents.length || taskDueDateEvents.length ? `${taskDueDateEvents.length} due dates - ${visibleAdvisorPreviewEvents.length} previews - ${advisorReservedPreviewEvents.length} breaks` : 'Criar eventos a partir das tasks'}</span>
            </div>
            {calendars.length > 0 && (
              <label>
                <span>Calendario default</span>
                <select value={advisorDefaultCalendarId} onChange={(event) => onAdvisorDefaultCalendarChange(event.target.value)}>
                  {calendars.map((calendar) => (
                    <option key={calendar.id} value={calendar.id}>{calendar.summary}</option>
                  ))}
                </select>
              </label>
            )}
            <button
              type="button"
              className="button primary small"
              onClick={canCreateCalendarEvents ? onRequestAdvisorCalendarEvents : onConnect}
              disabled={advisorLoading || loading}
            >
              {advisorLoading ? 'A preparar...' : canCreateCalendarEvents ? 'Criar eventos' : 'Ativar criacao'}
            </button>
            <button
              type="button"
              className="button secondary small"
              onClick={async () => {
                const calendar = calendars.find((item) => item.id === advisorDefaultCalendarId);
                const calendarName = calendar?.summary || advisorDefaultCalendarId || 'default';
                if (!window.confirm(`Apagar TODOS os eventos do calendario "${calendarName}"? Esta acao nao pode ser desfeita.`)) return;
                const result = await onDeleteDefaultCalendarEvents();
                if (result) window.alert(`Eventos apagados de "${result.calendarSummary}": ${result.deletedCount}. Ligacoes locais removidas: ${result.unlinkedCount}.`);
              }}
              disabled={!canCreateCalendarEvents || loading}
            >
              Apagar eventos default
            </button>
            {advisorConstraintCount > 0 && (
              <button type="button" className="button ghost small" onClick={onClearAdvisorScheduleConstraints} disabled={advisorLoading || loading}>
                Limpar ajustes ({advisorConstraintCount})
              </button>
            )}
          </div>

          <div className="calendar-week-controls">
            <div className="calendar-mode-toggle" aria-label="Modo de calendario">
              <button type="button" className={calendarMode === 'timeGridDay' ? 'is-active' : ''} onClick={() => changeView('timeGridDay')}>
                Dia
              </button>
              <button type="button" className={calendarMode === 'timeGridWeek' ? 'is-active' : ''} onClick={() => changeView('timeGridWeek')}>
                Semana
              </button>
              <button type="button" className={calendarMode === 'dayGridMonth' ? 'is-active' : ''} onClick={() => changeView('dayGridMonth')}>
                Mes
              </button>
            </div>
            <button type="button" className="button secondary small" onClick={() => moveCalendar('prev')} disabled={loading}>
              Anterior
            </button>
            <label>
              Data
              <input type="date" value={selectedDate} onChange={(event) => changeDate(event.target.value)} />
            </label>
            <button type="button" className="button secondary small" onClick={() => moveCalendar('next')} disabled={loading}>
              Seguinte
            </button>
            <button type="button" className="button primary small" onClick={() => loadVisibleRange(visibleStart, visibleEnd)} disabled={loading}>
              {loading ? 'A carregar...' : 'Atualizar'}
            </button>
            <strong className="calendar-current-range">{formatDateRange(visibleStart, visibleEnd)}</strong>
          </div>

          <div className="calendar-filter-bar" aria-label="Filtrar calendarios">
            <div>
              <strong>Calendarios</strong>
              <span>{selectedCalendarIds.length} de {calendars.length} ativos · {visibleEventCount} eventos visiveis</span>
            </div>
            <div className="calendar-filter-options">
              <button
                type="button"
                className="button secondary small"
                onClick={() => changeCalendarIds(calendars.map((calendar) => calendar.id))}
                disabled={loading || selectedCalendarIds.length === calendars.length}
              >
                Todos
              </button>
              <button
                type="button"
                className="button ghost small"
                onClick={() => changeCalendarIds([])}
                disabled={loading || selectedCalendarIds.length === 0}
              >
                Limpar
              </button>
              {calendars.map((calendar) => (
                <label className="calendar-filter-option" key={calendar.id}>
                  <input
                    type="checkbox"
                    checked={selectedCalendarIds.includes(calendar.id)}
                    onChange={() => changeCalendarIds(toggleCalendarId(selectedCalendarIds, calendar.id))}
                  />
                  <span style={{ backgroundColor: calendar.backgroundColor || undefined }} aria-hidden="true" />
                  {calendar.summary}
                </label>
              ))}
            </div>
          </div>

          <div className="calendar-fullcalendar-shell">
            <FullCalendar
              ref={calendarRef}
              plugins={[dayGridPlugin, interactionPlugin, timeGridPlugin]}
              initialView={calendarMode}
              initialDate={weekStart}
              headerToolbar={false}
              firstDay={1}
              height="auto"
              locale="pt"
              nowIndicator
              allDaySlot
              dayMaxEvents
              editable
              slotMinTime="00:00:00"
              slotMaxTime="24:00:00"
              events={fullCalendarEvents}
              datesSet={handleDatesSet}
              eventClick={handleEventClick}
              eventContent={renderEventContent}
              eventDrop={handleEventDrop}
              eventResize={handleEventResize}
            />
          </div>

          {selectedPreviewEvent && (
            <div className="dialog-backdrop" role="presentation" onMouseDown={() => setSelectedPreviewEvent(null)}>
              <section className="dialog calendar-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="calendar-preview-title" onMouseDown={(event) => event.stopPropagation()}>
                <header>
                  <h2 id="calendar-preview-title">Preview do advisor</h2>
                  <button type="button" className="icon-button" onClick={() => setSelectedPreviewEvent(null)} aria-label="Fechar">×</button>
                </header>
                <dl>
                  <div>
                    <dt>Titulo</dt>
                    <dd>{eventTitle(selectedPreviewEvent)}</dd>
                  </div>
                  <div>
                    <dt>Horario</dt>
                    <dd>{eventTimeRange(selectedPreviewEvent)}</dd>
                  </div>
                  <div>
                    <dt>Calendario</dt>
                    <dd>{selectedPreviewEvent.calendarSummary}</dd>
                  </div>
                  {selectedPreviewEvent.location && (
                    <div>
                      <dt>Local</dt>
                      <dd>{selectedPreviewEvent.location}</dd>
                    </div>
                  )}
                  {selectedPreviewEvent.description && (
                    <div>
                      <dt>Descricao</dt>
                      <dd>{selectedPreviewEvent.description}</dd>
                    </div>
                  )}
                </dl>
              </section>
            </div>
          )}
          {selectedBreakEvent && (
            <div className="dialog-backdrop" role="presentation" onMouseDown={() => setSelectedBreakEvent(null)}>
              <section className="dialog calendar-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="calendar-break-preview-title" onMouseDown={(event) => event.stopPropagation()}>
                <header>
                  <h2 id="calendar-break-preview-title">Break calculado</h2>
                  <button type="button" className="icon-button" onClick={() => setSelectedBreakEvent(null)} aria-label="Fechar">x</button>
                </header>
                <dl>
                  <div>
                    <dt>Horario</dt>
                    <dd>{eventTimeRange(selectedBreakEvent)}</dd>
                  </div>
                  <div>
                    <dt>Motivo</dt>
                    <dd>{selectedBreakEvent.reason || selectedBreakEvent.description || 'Break calculado pelo scheduler.'}</dd>
                  </div>
                </dl>
              </section>
            </div>
          )}
        </>
      )}
    </section>
  );
}
