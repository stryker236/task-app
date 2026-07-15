import type { Task } from '../../../shared/types';
import { useAdvisorContext } from '../context/AdvisorContext';
import { useGoogleCalendarContext } from '../context/GoogleCalendarContext';
import { filterAdvisorProposalBatch, type AdvisorProposalSurface } from '../utils/advisorProposalFilters';
import AdvisorPanel from './AdvisorPanel';

type AdvisorPanelContainerProps = {
  allTasks: Task[];
  proposalSurface?: AdvisorProposalSurface;
};

export default function AdvisorPanelContainer({ allTasks, proposalSurface = 'task-planning' }: AdvisorPanelContainerProps) {
  const googleCalendar = useGoogleCalendarContext();
  const advisor = useAdvisorContext();
  const visibleProposals = filterAdvisorProposalBatch(advisor.proposalBatch, proposalSurface, advisor.lastAdvisorAction);

  return (
    <AdvisorPanel
      allTasks={allTasks}
      advice={advisor.advisor}
      loading={advisor.advisorLoading}
      proposals={visibleProposals}
      currentAction={advisor.lastAdvisorAction}
      proposalStatuses={advisor.proposalStatuses}
      proposalFeedbackStatuses={advisor.proposalFeedbackStatuses}
      interactionFeedbackSaved={advisor.interactionFeedbackSaved}
      memoryRules={advisor.advisorMemoryRules}
      memoryLoading={advisor.advisorMemoryLoading}
      applyingProposalId={advisor.applyingProposalId}
      applyingAllProposals={advisor.applyingAllProposals}
      googleStatus={googleCalendar.googleStatus}
      googleCalendars={googleCalendar.googleCalendars}
      advisorDefaultCalendarId={googleCalendar.advisorDefaultCalendarId}
      onRefresh={advisor.refreshTaskAdvisorAdvice}
      onRequestActions={(action) => advisor.requestAdvisorActions(action, { defaultCalendarId: googleCalendar.advisorDefaultCalendarId })}
      onConnectGoogle={googleCalendar.connectGoogle}
      onApplyProposal={advisor.applyAdvisorProposal}
      onIgnoreProposal={advisor.ignoreAdvisorProposal}
      onApplyAllProposals={advisor.applyAllAdvisorProposals}
      onIgnoreAllProposals={advisor.ignoreAllAdvisorProposals}
      onClearProposals={advisor.clearAdvisorProposals}
      onAdvisorDefaultCalendarChange={googleCalendar.setAdvisorDefaultCalendarId}
      onChangeProposalCalendar={advisor.updateAdvisorProposalCalendar}
      onSaveProposalFeedback={advisor.saveAdvisorProposalFeedback}
      onSaveInteractionFeedback={advisor.saveAdvisorInteractionFeedback}
      onRefreshMemory={advisor.refreshAdvisorMemoryRules}
      onForgetMemory={advisor.forgetAdvisorMemoryRule}
      onOpenTask={advisor.openAdvisorRecommendedTask}
    />
  );
}
