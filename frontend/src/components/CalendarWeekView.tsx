import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin, { type EventResizeDoneArg } from '@fullcalendar/interaction';
import timeGridPlugin from '@fullcalendar/timegrid';
import { useMemo, useRef, useState } from 'react';
import type { DatesSetArg, EventClickArg, EventDropArg } from '@fullcalendar/core';
import type { GoogleCalendar, GoogleCalendarEvent, GoogleStatus, Task } from '../../../shared/types';
import type { AdvisorFeedbackInput, AdvisorPreview } from '../features/advisor/api';
import {
  addDays,
  advisorPreviewTaskId,
  CALENDAR_LABEL_INTERVAL,
  CALENDAR_SNAP_DURATION,
  ensureMinimumSnapEnd,
  eventDurationMinutes,
  eventTimeRange,
  eventTitle,
  formatDateRange,
  inputValueFromDate,
  isAdvisorPreviewEvent,
  isAdvisorReservedPreviewEvent,
  renderEventContent,
  roundDateToSnap,
  TIME_GRID_VIEW_OPTIONS,
  toFullCalendarEvent,
  toggleCalendarId,
  type CalendarDisplayEvent,
  type CalendarViewMode
} from '../features/calendar/calendarWeekUtils';
import type { AdvisorCalendarPreviewEvent, AdvisorReservedPreviewEvent } from '../utils/advisorCalendarPreviews';
import { AdvisorProposalFeedback, ProposalChanges } from './AdvisorPanel';

const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const CALENDAR_WRITE_SCOPE = 'https://www.googleapis.com/auth/calendar';

type CalendarWeekViewProps = {
  status: GoogleStatus;
  loading: boolean;
  allTasks: Task[];
  weekStart: string;
  weekEnd: string;
  events: GoogleCalendarEvent[];
  advisorPreviewEvents: AdvisorCalendarPreviewEvent[];
  advisorReservedPreviewEvents: AdvisorReservedPreviewEvent[];
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
  onLoadEvents: (date: string, calendarIds?: string[], options?: { forceRefresh?: boolean }) => void;
  onLoadRangeEvents: (start: string, end: string, calendarIds?: string[], options?: { forceRefresh?: boolean }) => void;
  onSendDailyTaskEmail: (date?: string) => Promise<{ to: string; date?: string; calendarSummary?: string; eventCount?: number; totalMinutes?: number; todayCount: number; overdueCount: number } | null>;
  onDeleteDefaultCalendarEvents: () => Promise<{ calendarSummary: string; deletedCount: number; unlinkedCount: number } | null>;
  advisorLoading: boolean;
  advisorConstraintCount: number;
  scheduleStartDate: string;
  onScheduleStartDateChange: (value: string) => void;
  onRequestAdvisorCalendarEvents: () => void;
  onMoveAdvisorPreviewEvent: (taskId: string, start: string, end: string) => void;
  onClearAdvisorScheduleConstraints: () => void;
  advisorProposals: AdvisorPreview | null;
  proposalFeedbackStatuses: Record<string, 'saved'>;
  applyingProposalId: string | null;
  applyingAllProposals: boolean;
  calendarWriteReady: boolean;
  onApplyProposal: (commandId: string) => void;
  onIgnoreProposal: (commandId: string) => void;
  onOpenTask: (taskId: string) => void;
  onSaveProposalFeedback: (commandId: string, feedback: AdvisorFeedbackInput['feedback']) => Promise<void>;
};

export default function CalendarWeekView({
  status,
  loading,
  allTasks,
  weekStart,
  weekEnd,
  events,
  advisorPreviewEvents,
  advisorReservedPreviewEvents,
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
  scheduleStartDate,
  onScheduleStartDateChange,
  onRequestAdvisorCalendarEvents,
  onMoveAdvisorPreviewEvent,
  onClearAdvisorScheduleConstraints,
  advisorProposals,
  proposalFeedbackStatuses,
  applyingProposalId,
  applyingAllProposals,
  calendarWriteReady,
  onApplyProposal,
  onIgnoreProposal,
  onOpenTask,
  onSaveProposalFeedback
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
    () => [...events, ...visibleAdvisorPreviewEvents, ...advisorReservedPreviewEvents].map(toFullCalendarEvent),
    [advisorReservedPreviewEvents, events, visibleAdvisorPreviewEvents]
  );

  const canSendEmail = status.scopes.includes(GMAIL_SEND_SCOPE);
  const canCreateCalendarEvents = status.connected && status.scopes.includes(CALENDAR_WRITE_SCOPE);
  const visibleEventCount = events.length + visibleAdvisorPreviewEvents.length + advisorReservedPreviewEvents.length;
  const selectedPreviewProposal = selectedPreviewEvent
    ? (advisorProposals?.commands || []).find((proposal) => proposal.id === selectedPreviewEvent.advisorProposalId) || null
    : null;

  function calendarApi() {
    return calendarRef.current?.getApi();
  }

  function loadVisibleRange(start: string, end: string, calendarIds = selectedCalendarIds, options: { forceRefresh?: boolean } = {}) {
    if (calendarMode === 'timeGridDay') {
      onLoadEvents(start, calendarIds, options);
      return;
    }
    onLoadRangeEvents(start, end, calendarIds, options);
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

  function goToCurrentWeek() {
    const api = calendarApi();
    if (!api) return;
    const today = inputValueFromDate(new Date());
    setCalendarMode('timeGridWeek');
    setSelectedDate(today);
    api.changeView('timeGridWeek', today);
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
    const roundedStart = roundDateToSnap(start);
    const rawEnd = end || new Date(start.getTime() + eventDurationMinutes(event) * 60000);
    const roundedEnd = ensureMinimumSnapEnd(roundedStart, roundDateToSnap(rawEnd));
    onMoveAdvisorPreviewEvent(advisorPreviewTaskId(event), roundedStart.toISOString(), roundedEnd.toISOString());
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
              ? `${formatDateRange(visibleStart, visibleEnd)} Â· ${busyCount} eventos Google Â· ${accountEmail || status.accountEmail || 'Google'}`
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
              <span>{visibleAdvisorPreviewEvents.length || advisorReservedPreviewEvents.length ? `${visibleAdvisorPreviewEvents.length} previews - ${advisorReservedPreviewEvents.length} breaks` : 'Criar eventos a partir das tasks'}</span>
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
            <label>
              <span>Agendar desde</span>
              <input type="date" value={scheduleStartDate} onChange={(event) => onScheduleStartDateChange(event.target.value)} />
            </label>
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
            <button type="button" className="button secondary small" onClick={goToCurrentWeek} disabled={loading}>
              Semana atual
            </button>
            <label>
              Data
              <input type="date" value={selectedDate} onChange={(event) => changeDate(event.target.value)} />
            </label>
            <button type="button" className="button secondary small" onClick={() => moveCalendar('next')} disabled={loading}>
              Seguinte
            </button>
            <button type="button" className="button primary small" onClick={() => loadVisibleRange(visibleStart, visibleEnd, selectedCalendarIds, { forceRefresh: true })} disabled={loading}>
              {loading ? 'A carregar...' : 'Atualizar'}
            </button>
            <strong className="calendar-current-range">{formatDateRange(visibleStart, visibleEnd)}</strong>
          </div>

          <div className="calendar-filter-bar" aria-label="Filtrar calendarios">
            <div>
              <strong>Calendarios</strong>
              <span>{selectedCalendarIds.length} de {calendars.length} ativos Â· {visibleEventCount} eventos visiveis</span>
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
              views={TIME_GRID_VIEW_OPTIONS}
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
              slotDuration={CALENDAR_SNAP_DURATION}
              snapDuration={CALENDAR_SNAP_DURATION}
              defaultTimedEventDuration={CALENDAR_SNAP_DURATION}
              forceEventDuration
              slotLabelInterval={CALENDAR_LABEL_INTERVAL}
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
              <section className="dialog calendar-preview-dialog advisor-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="calendar-preview-title" onMouseDown={(event) => event.stopPropagation()}>
                <header>
                  <div>
                    <span>Advisor preview</span>
                    <h2 id="calendar-preview-title">{selectedPreviewProposal?.summary || eventTitle(selectedPreviewEvent)}</h2>
                  </div>
                  <button type="button" className="icon-button" onClick={() => setSelectedPreviewEvent(null)} aria-label="Fechar">x</button>
                </header>

                {selectedPreviewProposal ? (
                  <>
                    <div className="advisor-preview-meta">
                      <span>{eventTimeRange(selectedPreviewEvent)}</span>
                      <span>{selectedPreviewEvent.calendarSummary}</span>
                    </div>
                    <p className="advisor-preview-reason">{selectedPreviewProposal.reason}</p>
                    <ProposalChanges proposal={selectedPreviewProposal} allTasks={allTasks} />
                    <AdvisorProposalFeedback
                      proposal={selectedPreviewProposal}
                      saved={proposalFeedbackStatuses[selectedPreviewProposal.id] === 'saved'}
                      googleCalendars={calendars}
                      onSave={(feedback) => onSaveProposalFeedback(selectedPreviewProposal.id, feedback)}
                    />
                    <div className="advisor-preview-actions">
                      {selectedPreviewProposal.taskId && (
                        <button type="button" className="button ghost small" onClick={() => onOpenTask(selectedPreviewProposal.taskId as string)}>
                          Abrir task
                        </button>
                      )}
                      <button
                        type="button"
                        className="button primary small"
                        onClick={() => {
                          onApplyProposal(selectedPreviewProposal.id);
                          setSelectedPreviewEvent(null);
                        }}
                        disabled={applyingAllProposals || applyingProposalId === selectedPreviewProposal.id || !calendarWriteReady}
                      >
                        {!calendarWriteReady ? 'Requer Google' : applyingProposalId === selectedPreviewProposal.id ? 'A aplicar...' : 'Aceitar'}
                      </button>
                      <button
                        type="button"
                        className="button secondary small"
                        onClick={() => {
                          onIgnoreProposal(selectedPreviewProposal.id);
                          setSelectedPreviewEvent(null);
                        }}
                        disabled={applyingAllProposals || applyingProposalId === selectedPreviewProposal.id}
                      >
                        Ignorar
                      </button>
                    </div>
                  </>
                ) : (
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
                )}
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







