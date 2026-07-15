import { useMemo, useState } from 'react';
import type { Task } from '../../../shared/types';
import { useAdvisorContext } from '../context/AdvisorContext';
import { useGoogleCalendarContext } from '../context/GoogleCalendarContext';
import { advisorCalendarPreviewEvents, advisorReservedPreviewEvents, taskDueDateCalendarEvents } from '../utils/advisorCalendarPreviews';
import { filterAdvisorProposalBatch } from '../utils/advisorProposalFilters';
import { AdvisorProposalBuffer } from './AdvisorPanel';
import CalendarWeekView from './CalendarWeekView';

const CALENDAR_WRITE_SCOPE = 'https://www.googleapis.com/auth/calendar';

function scheduleStartIso(value: string) {
  return value ? new Date(`${value}T00:00:00`).toISOString() : '';
}

type CalendarViewProps = {
  allTasks: Task[];
};

export default function CalendarView({ allTasks }: CalendarViewProps) {
  const googleCalendar = useGoogleCalendarContext();
  const advisor = useAdvisorContext();
  const [schedulerConstraints, setSchedulerConstraints] = useState<Array<{ taskId: string; start: string; end?: string }>>([]);
  const [scheduleStartDate, setScheduleStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const calendarProposals = useMemo(
    () => filterAdvisorProposalBatch(advisor.proposalBatch, 'calendar-events', advisor.lastAdvisorAction),
    [advisor.lastAdvisorAction, advisor.proposalBatch]
  );
  const advisorPreviewEvents = useMemo(
    () => advisorCalendarPreviewEvents(
      calendarProposals,
      advisor.proposalStatuses,
      googleCalendar.googleCalendars
    ),
    [calendarProposals, advisor.proposalStatuses, googleCalendar.googleCalendars]
  );
  const dueDateEvents = useMemo(() => taskDueDateCalendarEvents(allTasks), [allTasks]);
  const reservedPreviewEvents = useMemo(() => advisorReservedPreviewEvents(calendarProposals), [calendarProposals]);
  const calendarWriteReady = googleCalendar.googleStatus.connected && googleCalendar.googleStatus.scopes.includes(CALENDAR_WRITE_SCOPE);
  const showAdvisorBuffer = Boolean(calendarProposals);

  async function moveAdvisorPreviewEvent(taskId: string, start: string, end: string) {
    const nextConstraints = [
      ...schedulerConstraints.filter((constraint) => constraint.taskId !== taskId),
      { taskId, start, end }
    ];
    setSchedulerConstraints(nextConstraints);
    await advisor.rescheduleAdvisorCalendarEvents(googleCalendar.advisorDefaultCalendarId, nextConstraints, scheduleStartIso(scheduleStartDate));
  }

  async function clearAdvisorScheduleConstraints() {
    setSchedulerConstraints([]);
    await advisor.rescheduleAdvisorCalendarEvents(googleCalendar.advisorDefaultCalendarId, [], scheduleStartIso(scheduleStartDate));
  }

  return (
    <>
      <CalendarWeekView
        status={googleCalendar.googleStatus}
        loading={googleCalendar.googleLoading}
        weekStart={googleCalendar.calendarWeekStart}
        weekEnd={googleCalendar.calendarWeekEnd}
        events={googleCalendar.weeklyCalendarEvents}
        advisorPreviewEvents={advisorPreviewEvents}
        advisorReservedPreviewEvents={reservedPreviewEvents}
        taskDueDateEvents={dueDateEvents}
        calendars={googleCalendar.googleCalendars}
        selectedCalendarIds={googleCalendar.selectedCalendarIds}
        advisorDefaultCalendarId={googleCalendar.advisorDefaultCalendarId}
        accountEmail={googleCalendar.calendarAccountEmail}
        busyCount={googleCalendar.weeklyCalendarBusyCount}
        onWeekChange={googleCalendar.setCalendarWeekStart}
        onCalendarFilterChange={googleCalendar.setSelectedCalendarIds}
        onAdvisorDefaultCalendarChange={googleCalendar.setAdvisorDefaultCalendarId}
        onConnect={googleCalendar.connectGoogle}
        onDisconnect={googleCalendar.disconnectGoogleAccount}
        onLoadEvents={googleCalendar.loadCalendarWeekEvents}
        onLoadRangeEvents={googleCalendar.loadCalendarRangeEvents}
        onSendDailyTaskEmail={googleCalendar.sendDailyTaskEmail}
        onDeleteDefaultCalendarEvents={googleCalendar.deleteDefaultCalendarEvents}
        advisorLoading={advisor.advisorLoading}
        advisorConstraintCount={schedulerConstraints.length}
        scheduleStartDate={scheduleStartDate}
        onScheduleStartDateChange={setScheduleStartDate}
        onRequestAdvisorCalendarEvents={() => advisor.requestAdvisorActions('schedule_calendar_events', { defaultCalendarId: googleCalendar.advisorDefaultCalendarId, schedulerConstraints, scheduleStartFrom: scheduleStartIso(scheduleStartDate) })}
        onMoveAdvisorPreviewEvent={moveAdvisorPreviewEvent}
        onClearAdvisorScheduleConstraints={clearAdvisorScheduleConstraints}
      />
      {showAdvisorBuffer && (
        <AdvisorProposalBuffer
          allTasks={allTasks}
          googleCalendars={googleCalendar.googleCalendars}
          proposals={calendarProposals}
          action={advisor.lastAdvisorAction}
          proposalStatuses={advisor.proposalStatuses}
          proposalFeedbackStatuses={advisor.proposalFeedbackStatuses}
          interactionFeedbackSaved={advisor.interactionFeedbackSaved}
          applyingProposalId={advisor.applyingProposalId}
          applyingAllProposals={advisor.applyingAllProposals}
          calendarWriteReady={calendarWriteReady}
          onConnectGoogle={googleCalendar.connectGoogle}
          onApplyProposal={advisor.applyAdvisorProposal}
          onIgnoreProposal={advisor.ignoreAdvisorProposal}
          onApplyAllProposals={advisor.applyAllAdvisorProposals}
          onIgnoreAllProposals={advisor.ignoreAllAdvisorProposals}
          onClearProposals={advisor.clearAdvisorProposals}
          onChangeProposalCalendar={advisor.updateAdvisorProposalCalendar}
          onSaveProposalFeedback={advisor.saveAdvisorProposalFeedback}
          onSaveInteractionFeedback={advisor.saveAdvisorInteractionFeedback}
          onOpenTask={advisor.openAdvisorRecommendedTask}
        />
      )}
    </>
  );
}
