import { useMemo, useState } from 'react';
import type { Task } from '../../../shared/types';
import { useAdvisorContext } from '../context/AdvisorContext';
import { useGoogleCalendarContext } from '../context/GoogleCalendarContext';
import { advisorCalendarPreviewEvents, advisorReservedPreviewEvents, taskDueDateCalendarEvents } from '../utils/advisorCalendarPreviews';
import { AdvisorProposalBuffer } from './AdvisorPanel';
import CalendarWeekView from './CalendarWeekView';

const CALENDAR_WRITE_SCOPE = 'https://www.googleapis.com/auth/calendar';

type CalendarViewProps = {
  allTasks: Task[];
};

export default function CalendarView({ allTasks }: CalendarViewProps) {
  const googleCalendar = useGoogleCalendarContext();
  const advisor = useAdvisorContext();
  const [schedulerConstraints, setSchedulerConstraints] = useState<Array<{ taskId: string; start: string; end?: string }>>([]);
  const advisorPreviewEvents = useMemo(
    () => advisorCalendarPreviewEvents(
      advisor.proposalBatch,
      advisor.proposalStatuses,
      googleCalendar.googleCalendars
    ),
    [advisor.proposalBatch, advisor.proposalStatuses, googleCalendar.googleCalendars]
  );
  const dueDateEvents = useMemo(() => taskDueDateCalendarEvents(allTasks), [allTasks]);
  const reservedPreviewEvents = useMemo(() => advisorReservedPreviewEvents(advisor.proposalBatch), [advisor.proposalBatch]);
  const calendarWriteReady = googleCalendar.googleStatus.connected && googleCalendar.googleStatus.scopes.includes(CALENDAR_WRITE_SCOPE);
  const showAdvisorBuffer = advisor.lastAdvisorAction === 'schedule_calendar_events'
    || (advisor.proposalBatch?.commands || []).some((command) => command.type === 'create_calendar_event');

  async function moveAdvisorPreviewEvent(taskId: string, start: string, end: string) {
    const nextConstraints = [
      ...schedulerConstraints.filter((constraint) => constraint.taskId !== taskId),
      { taskId, start, end }
    ];
    setSchedulerConstraints(nextConstraints);
    await advisor.rescheduleAdvisorCalendarEvents(googleCalendar.advisorDefaultCalendarId, nextConstraints);
  }

  async function clearAdvisorScheduleConstraints() {
    setSchedulerConstraints([]);
    await advisor.rescheduleAdvisorCalendarEvents(googleCalendar.advisorDefaultCalendarId, []);
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
        onRequestAdvisorCalendarEvents={() => advisor.requestAdvisorActions('schedule_calendar_events', { defaultCalendarId: googleCalendar.advisorDefaultCalendarId, schedulerConstraints })}
        onMoveAdvisorPreviewEvent={moveAdvisorPreviewEvent}
        onClearAdvisorScheduleConstraints={clearAdvisorScheduleConstraints}
      />
      {showAdvisorBuffer && (
        <AdvisorProposalBuffer
          allTasks={allTasks}
          googleCalendars={googleCalendar.googleCalendars}
          proposals={advisor.proposalBatch}
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
