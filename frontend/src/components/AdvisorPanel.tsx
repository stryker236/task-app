import { useMemo, useState } from 'react';
import type { AiCommand, GoogleCalendar, GoogleStatus, Task } from '../../../shared/types';
import type { AdvisorAdvice, AdvisorFeedbackInput, AdvisorMemoryRule, AdvisorPreview } from '../api';
import AdvisorAdviceGrid, { type AdvisorActionItem } from './advisor/AdvisorAdviceGrid';
import AdvisorPanelHeader, { advisorCalendarWriteReady } from './advisor/AdvisorPanelHeader';

const COMMAND_LABELS = {
  update_task: 'Atualizar task',
  add_relation: 'Adicionar relacao',
  create_task: 'Criar task',
  create_calendar_event: 'Criar evento'
};

const VISIBLE_FIELDS = [
  ['title', 'Titulo'],
  ['notes', 'Notas'],
  ['priority', 'Prioridade'],
  ['status', 'Estado'],
  ['dueDateTime', 'Prazo'],
  ['estimatedMinutes', 'Estimativa'],
  ['isFavorite', 'Favorita'],
  ['tags', 'Tags'],
  ['blockedByTaskIds', 'Blocked by'],
  ['checklistItems', 'Checklist']
] as const;

type ProposalStatus = 'accepted' | 'ignored';
type ProposalStatuses = Record<string, ProposalStatus>;
type ProposalFeedbackStatuses = Record<string, 'saved'>;
type ObjectRecord = Record<string, unknown>;

type AdvisorPanelProps = {
  allTasks?: Task[];
  advice: AdvisorAdvice | null;
  loading: boolean;
  proposals: AdvisorPreview | null;
  currentAction: string;
  proposalStatuses: ProposalStatuses;
  proposalFeedbackStatuses: ProposalFeedbackStatuses;
  interactionFeedbackSaved: boolean;
  memoryRules: AdvisorMemoryRule[];
  memoryLoading: boolean;
  applyingProposalId: string | null;
  applyingAllProposals: boolean;
  googleStatus: GoogleStatus;
  googleCalendars: GoogleCalendar[];
  advisorDefaultCalendarId: string;
  onRefresh: () => void;
  onRequestActions: (action: string) => void;
  onConnectGoogle: () => void;
  onApplyProposal: (commandId: string, commandOverride?: AiCommand) => void;
  onApplyProposals: (commandIds: string[], commandOverrides?: Record<string, AiCommand>) => void;
  onIgnoreProposal: (commandId: string) => void;
  onApplyAllProposals: (commandOverrides?: Record<string, AiCommand>) => void;
  onIgnoreAllProposals: () => void;
  onClearProposals: () => void;
  onAdvisorDefaultCalendarChange: (calendarId: string) => void;
  onChangeProposalCalendar: (commandId: string, calendarId: string, calendarSummary: string) => void;
  onSaveProposalFeedback: (commandId: string, feedback: AdvisorFeedbackInput['feedback']) => Promise<void>;
  onSaveInteractionFeedback: (feedback: AdvisorFeedbackInput['feedback']) => Promise<void>;
  onRefreshMemory: () => void;
  onForgetMemory: (id: string) => void;
  onOpenTask: (taskId: string) => void;
};

function isObject(value: unknown): value is ObjectRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function fieldValue(source: unknown, field: string) {
  return isObject(source) ? source[field] : undefined;
}

function formatValue(value: unknown): string {
  if (Array.isArray(value) && value.some((item) => isObject(item))) {
    return value.length ? value.map((item) => `${item.isDone ? '✓' : '□'} ${String(item.title || '')}`).join('; ') : '—';
  }
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  if (value === true) return 'sim';
  if (value === false) return 'nao';
  if (value == null || value === '') return '—';
  return String(value);
}

function changedFields(before: unknown = {}, after: unknown = {}) {
  return VISIBLE_FIELDS
    .map(([field, label]) => ({ field, label, before: fieldValue(before, field), after: fieldValue(after, field) }))
    .filter((change) => JSON.stringify(change.before ?? null) !== JSON.stringify(change.after ?? null));
}

function affectedCardTitle(proposal: AdvisorPreview['commands'][number]) {
  const changes = proposal.changes as ObjectRecord | undefined;
  const calendarEvent = changes?.calendarEvent as ObjectRecord | undefined;
  const createdTask = fieldValue(changes?.createdTask, 'title');
  const beforeTitle = fieldValue(changes?.before, 'title');
  const afterTitle = fieldValue(changes?.after, 'title');
  if (proposal.type === 'create_task') return typeof createdTask === 'string' ? createdTask : 'Nova task';
  if (proposal.type === 'create_calendar_event') return String(calendarEvent?.summary || proposal.summary || 'Novo evento');
  return String(beforeTitle || afterTitle || proposal.taskId || 'Task');
}

function proposedTags(proposal: AdvisorPreview['commands'][number]) {
  const changes = proposal.changes as ObjectRecord | undefined;
  const after = fieldValue(changes?.after, 'tags');
  const created = fieldValue(changes?.createdTask, 'tags');
  const tags = Array.isArray(after) ? after : Array.isArray(created) ? created : [];
  return tags.map(String).filter(Boolean);
}

function isPriorityProposal(proposal: AdvisorPreview['commands'][number]) {
  const fields = changedFields((proposal.changes as ObjectRecord | undefined)?.before, (proposal.changes as ObjectRecord | undefined)?.after);
  return proposal.type === 'update_task' && fields.length === 1 && fields[0]?.field === 'priority';
}

function isDueDateProposal(proposal: AdvisorPreview['commands'][number]) {
  const fields = changedFields((proposal.changes as ObjectRecord | undefined)?.before, (proposal.changes as ObjectRecord | undefined)?.after);
  return proposal.type === 'update_task' && fields.length === 1 && fields[0]?.field === 'dueDateTime';
}

function isCalendarEventProposal(proposal: AdvisorPreview['commands'][number]) {
  return proposal.type === 'create_calendar_event';
}

function proposalCalendarStart(proposal: AdvisorPreview['commands'][number]) {
  const calendarEvent = (proposal.changes as ObjectRecord | undefined)?.calendarEvent as ObjectRecord | undefined;
  return typeof calendarEvent?.start === 'string' ? calendarEvent.start : '';
}

function proposalDayKey(proposal: AdvisorPreview['commands'][number]) {
  const start = proposalCalendarStart(proposal);
  if (!start) return '';
  const date = new Date(start);
  if (Number.isNaN(date.getTime())) return start.slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function formatProposalDay(day: string) {
  const date = new Date(`${day}T00:00:00`);
  if (Number.isNaN(date.getTime())) return day;
  return new Intl.DateTimeFormat('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' }).format(date);
}
function taskTitleFromId(allTasks: Task[], id: string | null) {
  if (!id) return null;
  return allTasks.find((task) => task.id === id)?.title || id;
}

export function AdvisorProposalFeedback({
  proposal,
  saved,
  googleCalendars = [],
  onSave
}: {
  proposal: AdvisorPreview['commands'][number];
  saved: boolean;
  googleCalendars?: GoogleCalendar[];
  onSave: (feedback: AdvisorFeedbackInput['feedback']) => Promise<void>;
}) {
  const tags = proposedTags(proposal);
  const calendarEvent = (proposal.changes as ObjectRecord | undefined)?.calendarEvent as ObjectRecord | undefined;
  const chosenCalendarId = String(calendarEvent?.calendarId || '');
  const chosenCalendarSummary = String(calendarEvent?.calendarSummary || chosenCalendarId || 'primary');
  const [overall, setOverall] = useState<AdvisorFeedbackInput['feedback']['overall']>('mixed');
  const [tagVolume, setTagVolume] = useState<AdvisorFeedbackInput['feedback']['tagVolume']>('ok');
  const [goodTags, setGoodTags] = useState<string[]>([]);
  const [badTags, setBadTags] = useState<string[]>([]);
  const [wrongReason, setWrongReason] = useState(false);
  const [wrongPriority, setWrongPriority] = useState(false);
  const [wrongDeadline, setWrongDeadline] = useState(false);
  const [priorityDirection, setPriorityDirection] = useState<AdvisorFeedbackInput['feedback']['priorityDirection']>('ok');
  const [taskAgeImportance, setTaskAgeImportance] = useState<AdvisorFeedbackInput['feedback']['taskAgeImportance']>('ok');
  const [overdueImportance, setOverdueImportance] = useState<AdvisorFeedbackInput['feedback']['overdueImportance']>('ok');
  const [dueDateDirection, setDueDateDirection] = useState<AdvisorFeedbackInput['feedback']['dueDateDirection']>('ok');
  const [calendarChoice, setCalendarChoice] = useState<AdvisorFeedbackInput['feedback']['calendarChoice']>('ok');
  const [calendarDurationDirection, setCalendarDurationDirection] = useState<AdvisorFeedbackInput['feedback']['calendarDurationDirection']>('ok');
  const [unnecessaryEvent, setUnnecessaryEvent] = useState(false);
  const [wrongCalendar, setWrongCalendar] = useState(false);
  const [preferredCalendarId, setPreferredCalendarId] = useState('');
  const [shouldBeUrgent, setShouldBeUrgent] = useState(false);
  const [shouldBeLowerPriority, setShouldBeLowerPriority] = useState(false);
  const [missingContext, setMissingContext] = useState(false);
  const priorityProposal = isPriorityProposal(proposal);
  const dueDateProposal = isDueDateProposal(proposal);
  const calendarEventProposal = isCalendarEventProposal(proposal);
  const selectedPreferredCalendar = googleCalendars.find((calendar) => calendar.id === preferredCalendarId);

  function toggle(list: string[], setter: (value: string[]) => void, tag: string) {
    setter(list.includes(tag) ? list.filter((item) => item !== tag) : [...list, tag]);
  }

  return (
    <details className="advisor-feedback">
      <summary>{saved ? 'Feedback guardado' : 'Dar feedback'}</summary>
      <div className="advisor-feedback-grid">
        <label><input type="radio" checked={overall === 'useful'} onChange={() => setOverall('useful')} /> Útil</label>
        <label><input type="radio" checked={overall === 'mixed'} onChange={() => setOverall('mixed')} /> Misto</label>
        <label><input type="radio" checked={overall === 'not_useful'} onChange={() => setOverall('not_useful')} /> Fraco</label>
      </div>

      {priorityProposal ? (
        <>
          <div className="advisor-feedback-grid">
            <label><input type="radio" checked={priorityDirection === 'too_high'} onChange={() => setPriorityDirection('too_high')} /> Prioridade alta demais</label>
            <label><input type="radio" checked={priorityDirection === 'ok'} onChange={() => setPriorityDirection('ok')} /> Prioridade ok</label>
            <label><input type="radio" checked={priorityDirection === 'too_low'} onChange={() => setPriorityDirection('too_low')} /> Prioridade baixa demais</label>
          </div>
          <div className="advisor-feedback-grid">
            <label><input type="radio" checked={taskAgeImportance === 'too_much'} onChange={() => setTaskAgeImportance('too_much')} /> Valorizou demais a antiguidade</label>
            <label><input type="radio" checked={taskAgeImportance === 'ok'} onChange={() => setTaskAgeImportance('ok')} /> Antiguidade ok</label>
            <label><input type="radio" checked={taskAgeImportance === 'too_little'} onChange={() => setTaskAgeImportance('too_little')} /> Valorizou pouco a antiguidade</label>
          </div>
          <div className="advisor-feedback-grid">
            <label><input type="radio" checked={overdueImportance === 'too_much'} onChange={() => setOverdueImportance('too_much')} /> Valorizou demais o atraso</label>
            <label><input type="radio" checked={overdueImportance === 'ok'} onChange={() => setOverdueImportance('ok')} /> Atraso ok</label>
            <label><input type="radio" checked={overdueImportance === 'too_little'} onChange={() => setOverdueImportance('too_little')} /> Valorizou pouco o atraso</label>
          </div>
          <div className="advisor-feedback-grid">
            <label><input type="checkbox" checked={shouldBeUrgent} onChange={(event) => setShouldBeUrgent(event.target.checked)} /> Devia ser urgente</label>
            <label><input type="checkbox" checked={shouldBeLowerPriority} onChange={(event) => setShouldBeLowerPriority(event.target.checked)} /> Devia baixar prioridade</label>
          </div>
        </>
      ) : dueDateProposal ? (
        <div className="advisor-feedback-grid">
          <label><input type="radio" checked={dueDateDirection === 'too_early'} onChange={() => setDueDateDirection('too_early')} /> Prazo cedo demais</label>
          <label><input type="radio" checked={dueDateDirection === 'ok'} onChange={() => setDueDateDirection('ok')} /> Prazo ok</label>
          <label><input type="radio" checked={dueDateDirection === 'too_late'} onChange={() => setDueDateDirection('too_late')} /> Prazo tarde demais</label>
        </div>
      ) : calendarEventProposal ? (
        <>
          <div className="advisor-feedback-grid">
            <label><input type="checkbox" checked={unnecessaryEvent} onChange={(event) => setUnnecessaryEvent(event.target.checked)} /> Evento desnecessario</label>
          </div>
          <div className="advisor-feedback-calendar">
            <span>Calendario escolhido</span>
            <strong>{chosenCalendarSummary}</strong>
            <div className="advisor-feedback-grid">
              <label><input type="radio" checked={calendarChoice === 'ok'} onChange={() => { setCalendarChoice('ok'); setWrongCalendar(false); setPreferredCalendarId(''); }} /> Correto</label>
              <label><input type="radio" checked={calendarChoice === 'wrong'} onChange={() => { setCalendarChoice('wrong'); setWrongCalendar(true); }} /> Errado</label>
            </div>
            {calendarChoice === 'wrong' && googleCalendars.length > 0 && (
              <label>
                <span>Calendario preferido</span>
                <select value={preferredCalendarId} onChange={(event) => setPreferredCalendarId(event.target.value)}>
                  <option value="">Escolher calendario...</option>
                  {googleCalendars.map((calendar) => (
                    <option key={calendar.id} value={calendar.id}>{calendar.summary}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="advisor-feedback-grid">
            <label><input type="radio" checked={dueDateDirection === 'too_early'} onChange={() => setDueDateDirection('too_early')} /> Hora cedo demais</label>
            <label><input type="radio" checked={dueDateDirection === 'ok'} onChange={() => setDueDateDirection('ok')} /> Hora ok</label>
            <label><input type="radio" checked={dueDateDirection === 'too_late'} onChange={() => setDueDateDirection('too_late')} /> Hora tarde demais</label>
          </div>
          <div className="advisor-feedback-grid">
            <label><input type="radio" checked={calendarDurationDirection === 'too_short'} onChange={() => setCalendarDurationDirection('too_short')} /> Duracao curta demais</label>
            <label><input type="radio" checked={calendarDurationDirection === 'ok'} onChange={() => setCalendarDurationDirection('ok')} /> Duracao ok</label>
            <label><input type="radio" checked={calendarDurationDirection === 'too_long'} onChange={() => setCalendarDurationDirection('too_long')} /> Duracao longa demais</label>
          </div>
        </>
      ) : tags.length > 0 && (
        <div className="advisor-feedback-tags">
          <span>Tags boas</span>
          {tags.map((tag) => <label key={`good-${tag}`}><input type="checkbox" checked={goodTags.includes(tag)} onChange={() => toggle(goodTags, setGoodTags, tag)} /> #{tag}</label>)}
          <span>Tags más</span>
          {tags.map((tag) => <label key={`bad-${tag}`}><input type="checkbox" checked={badTags.includes(tag)} onChange={() => toggle(badTags, setBadTags, tag)} /> #{tag}</label>)}
        </div>
      )}

      {!priorityProposal && !dueDateProposal && !calendarEventProposal && <div className="advisor-feedback-grid">
        <label><input type="radio" checked={tagVolume === 'more'} onChange={() => setTagVolume('more')} /> Mais tags</label>
        <label><input type="radio" checked={tagVolume === 'ok'} onChange={() => setTagVolume('ok')} /> Quantidade ok</label>
        <label><input type="radio" checked={tagVolume === 'less'} onChange={() => setTagVolume('less')} /> Menos tags</label>
      </div>}

      <div className="advisor-feedback-grid">
        <label><input type="checkbox" checked={wrongReason} onChange={(event) => setWrongReason(event.target.checked)} /> Razão fraca</label>
        {!priorityProposal && !dueDateProposal && !calendarEventProposal && <label><input type="checkbox" checked={wrongPriority} onChange={(event) => setWrongPriority(event.target.checked)} /> Prioridade errada</label>}
        {!calendarEventProposal && <label><input type="checkbox" checked={wrongDeadline} onChange={(event) => setWrongDeadline(event.target.checked)} /> Prazo errado</label>}
        <label><input type="checkbox" checked={missingContext} onChange={(event) => setMissingContext(event.target.checked)} /> Devia pedir contexto</label>
      </div>

      <button
        type="button"
        className="button secondary small"
        onClick={() => onSave({
          overall,
          tagVolume: priorityProposal || dueDateProposal || calendarEventProposal ? 'ok' : tagVolume,
          goodTags: priorityProposal || dueDateProposal || calendarEventProposal ? [] : goodTags,
          badTags: priorityProposal || dueDateProposal || calendarEventProposal ? [] : badTags,
          wrongReason,
          wrongPriority: priorityProposal ? priorityDirection !== 'ok' || wrongPriority : wrongPriority,
          wrongDeadline: dueDateProposal || calendarEventProposal ? dueDateDirection !== 'ok' || wrongDeadline : wrongDeadline,
          priorityDirection,
          taskAgeImportance,
          overdueImportance,
          dueDateDirection,
          calendarChoice,
          calendarDurationDirection,
          unnecessaryEvent,
          wrongCalendar: wrongCalendar || calendarChoice === 'wrong',
          chosenCalendarId,
          chosenCalendarSummary,
          preferredCalendarId: calendarChoice === 'wrong' ? preferredCalendarId : '',
          preferredCalendarSummary: calendarChoice === 'wrong' ? selectedPreferredCalendar?.summary || '' : '',
          shouldBeUrgent,
          shouldBeLowerPriority,
          missingContext
        })}
        disabled={saved}
      >
        {saved ? 'Guardado' : 'Guardar feedback'}
      </button>
    </details>
  );
}

function AdvisorInteractionFeedback({
  saved,
  action,
  onSave
}: {
  saved: boolean;
  action?: string;
  onSave: (feedback: AdvisorFeedbackInput['feedback']) => Promise<void>;
}) {
  const [overall, setOverall] = useState<AdvisorFeedbackInput['feedback']['overall']>('mixed');
  const [wrongReason, setWrongReason] = useState(false);
  const [wrongPriority, setWrongPriority] = useState(false);
  const [wrongDeadline, setWrongDeadline] = useState(false);
  const [priorityDirection, setPriorityDirection] = useState<AdvisorFeedbackInput['feedback']['priorityDirection']>('ok');
  const [taskAgeImportance, setTaskAgeImportance] = useState<AdvisorFeedbackInput['feedback']['taskAgeImportance']>('ok');
  const [overdueImportance, setOverdueImportance] = useState<AdvisorFeedbackInput['feedback']['overdueImportance']>('ok');
  const [dueDateDirection, setDueDateDirection] = useState<AdvisorFeedbackInput['feedback']['dueDateDirection']>('ok');
  const [calendarDurationDirection, setCalendarDurationDirection] = useState<AdvisorFeedbackInput['feedback']['calendarDurationDirection']>('ok');
  const [unnecessaryEvent, setUnnecessaryEvent] = useState(false);
  const [wrongCalendar, setWrongCalendar] = useState(false);
  const [missingContext, setMissingContext] = useState(false);
  const priorityInteraction = action === 'priority_management';
  const dueDateInteraction = action === 'suggest_due_dates';
  const calendarInteraction = action === 'schedule_calendar_events';

  return (
    <details className="advisor-feedback advisor-interaction-feedback">
      <summary>{saved ? 'Feedback da interacao guardado' : 'Feedback da interacao'}</summary>
      <div className="advisor-feedback-grid">
        <label><input type="radio" checked={overall === 'useful'} onChange={() => setOverall('useful')} /> Util</label>
        <label><input type="radio" checked={overall === 'mixed'} onChange={() => setOverall('mixed')} /> Mista</label>
        <label><input type="radio" checked={overall === 'not_useful'} onChange={() => setOverall('not_useful')} /> Fraca</label>
      </div>
      {priorityInteraction && (
        <>
          <div className="advisor-feedback-grid">
            <label><input type="radio" checked={priorityDirection === 'too_high'} onChange={() => setPriorityDirection('too_high')} /> Subiu demais prioridades</label>
            <label><input type="radio" checked={priorityDirection === 'ok'} onChange={() => setPriorityDirection('ok')} /> Direcao ok</label>
            <label><input type="radio" checked={priorityDirection === 'too_low'} onChange={() => setPriorityDirection('too_low')} /> Subiu pouco prioridades</label>
          </div>
          <div className="advisor-feedback-grid">
            <label><input type="radio" checked={taskAgeImportance === 'too_much'} onChange={() => setTaskAgeImportance('too_much')} /> Peso excessivo na antiguidade</label>
            <label><input type="radio" checked={taskAgeImportance === 'ok'} onChange={() => setTaskAgeImportance('ok')} /> Antiguidade ok</label>
            <label><input type="radio" checked={taskAgeImportance === 'too_little'} onChange={() => setTaskAgeImportance('too_little')} /> Pouco peso na antiguidade</label>
          </div>
          <div className="advisor-feedback-grid">
            <label><input type="radio" checked={overdueImportance === 'too_much'} onChange={() => setOverdueImportance('too_much')} /> Peso excessivo no atraso</label>
            <label><input type="radio" checked={overdueImportance === 'ok'} onChange={() => setOverdueImportance('ok')} /> Atraso ok</label>
            <label><input type="radio" checked={overdueImportance === 'too_little'} onChange={() => setOverdueImportance('too_little')} /> Pouco peso no atraso</label>
          </div>
        </>
      )}
      {dueDateInteraction && (
        <div className="advisor-feedback-grid">
          <label><input type="radio" checked={dueDateDirection === 'too_early'} onChange={() => setDueDateDirection('too_early')} /> Prazos cedo demais</label>
          <label><input type="radio" checked={dueDateDirection === 'ok'} onChange={() => setDueDateDirection('ok')} /> Prazos ok</label>
          <label><input type="radio" checked={dueDateDirection === 'too_late'} onChange={() => setDueDateDirection('too_late')} /> Prazos tarde demais</label>
        </div>
      )}
      {calendarInteraction && (
        <>
          <div className="advisor-feedback-grid">
            <label><input type="checkbox" checked={unnecessaryEvent} onChange={(event) => setUnnecessaryEvent(event.target.checked)} /> Criou eventos desnecessarios</label>
            <label><input type="checkbox" checked={wrongCalendar} onChange={(event) => setWrongCalendar(event.target.checked)} /> Escolheu calendario errado</label>
          </div>
          <div className="advisor-feedback-grid">
            <label><input type="radio" checked={dueDateDirection === 'too_early'} onChange={() => setDueDateDirection('too_early')} /> Horas cedo demais</label>
            <label><input type="radio" checked={dueDateDirection === 'ok'} onChange={() => setDueDateDirection('ok')} /> Horas ok</label>
            <label><input type="radio" checked={dueDateDirection === 'too_late'} onChange={() => setDueDateDirection('too_late')} /> Horas tarde demais</label>
          </div>
          <div className="advisor-feedback-grid">
            <label><input type="radio" checked={calendarDurationDirection === 'too_short'} onChange={() => setCalendarDurationDirection('too_short')} /> Duracoes curtas demais</label>
            <label><input type="radio" checked={calendarDurationDirection === 'ok'} onChange={() => setCalendarDurationDirection('ok')} /> Duracoes ok</label>
            <label><input type="radio" checked={calendarDurationDirection === 'too_long'} onChange={() => setCalendarDurationDirection('too_long')} /> Duracoes longas demais</label>
          </div>
        </>
      )}
      <div className="advisor-feedback-grid">
        <label><input type="checkbox" checked={wrongReason} onChange={(event) => setWrongReason(event.target.checked)} /> Razao fraca</label>
        {!priorityInteraction && !dueDateInteraction && !calendarInteraction && <label><input type="checkbox" checked={wrongPriority} onChange={(event) => setWrongPriority(event.target.checked)} /> Prioridades erradas</label>}
        {!calendarInteraction && <label><input type="checkbox" checked={wrongDeadline} onChange={(event) => setWrongDeadline(event.target.checked)} /> Prazos mal avaliados</label>}
        <label><input type="checkbox" checked={missingContext} onChange={(event) => setMissingContext(event.target.checked)} /> Devia pedir contexto</label>
      </div>
      <button
        type="button"
        className="button secondary small"
        onClick={() => onSave({
          overall,
          tagVolume: 'ok',
          goodTags: [],
          badTags: [],
          wrongReason,
          wrongPriority: priorityInteraction ? priorityDirection !== 'ok' || wrongPriority : wrongPriority,
          wrongDeadline: dueDateInteraction || calendarInteraction ? dueDateDirection !== 'ok' || wrongDeadline : wrongDeadline,
          priorityDirection,
          taskAgeImportance,
          overdueImportance,
          dueDateDirection,
          calendarDurationDirection,
          unnecessaryEvent,
          wrongCalendar,
          shouldBeUrgent: false,
          shouldBeLowerPriority: false,
          missingContext
        })}
        disabled={saved}
      >
        {saved ? 'Guardado' : 'Guardar feedback'}
      </button>
    </details>
  );
}

export function ProposalChanges({ proposal, allTasks = [] }: { proposal: AdvisorPreview['commands'][number]; allTasks?: Task[] }) {
  const changes = proposal.changes as ObjectRecord | undefined;

  if (proposal.type === 'create_calendar_event') {
    const event = changes?.calendarEvent as ObjectRecord | undefined;
    if (!event) return null;
    return (
      <dl className="advisor-change-list">
        <div><dt>Titulo</dt><dd>{String(event.summary || '')}</dd></div>
        <div><dt>Inicio</dt><dd>{String(event.start || '')}</dd></div>
        <div><dt>Fim</dt><dd>{String(event.end || '')}</dd></div>
        <div><dt>Calendario</dt><dd>{String(event.calendarSummary || event.calendarId || 'primary')}</dd></div>
        {event.calendarSelectionReason ? <div><dt>Motivo calendario</dt><dd>{String(event.calendarSelectionReason)}</dd></div> : null}
        {event.location ? <div><dt>Local</dt><dd>{String(event.location)}</dd></div> : null}
        {event.description ? <div><dt>Descricao</dt><dd>{String(event.description)}</dd></div> : null}
      </dl>
    );
  }

  if (proposal.type === 'create_task') {
    const task = changes?.createdTask as Partial<Task> | undefined;
    if (!task) return null;
    return (
      <dl className="advisor-change-list">
        <div><dt>Titulo</dt><dd>{task.title}</dd></div>
        <div><dt>Prioridade</dt><dd>{task.priority}</dd></div>
        <div><dt>Estado</dt><dd>{task.status}</dd></div>
        <div><dt>Tags</dt><dd>{formatValue(task.tags)}</dd></div>
      </dl>
    );
  }

  if (proposal.type === 'add_relation') {
    const taskTitle = proposal.taskTitle || String(fieldValue(changes?.before, 'title') || taskTitleFromId(allTasks, proposal.taskId));
    const relatedTaskTitle = proposal.relatedTaskTitle || taskTitleFromId(allTasks, proposal.relatedTaskId);

    return (
      <dl className="advisor-change-list">
        <div><dt>Relacao</dt><dd>{proposal.relationType}</dd></div>
        <div><dt>Task origem</dt><dd>{taskTitle}</dd></div>
        <div><dt>Task relacionada</dt><dd>{relatedTaskTitle}</dd></div>
      </dl>
    );
  }

  const fieldChanges = changedFields(changes?.before, changes?.after);
  if (!fieldChanges.length) return <p className="advisor-empty">Sem diferencas materiais.</p>;

  return (
    <dl className="advisor-change-list">
      {fieldChanges.map((change) => (
        <div key={change.field}>
          <dt>{change.label}</dt>
          <dd>
            <span>{formatValue(change.before)}</span>
            <strong>→</strong>
            <span>{formatValue(change.after)}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function AdvisorDebugSummary({ proposals }: { proposals: AdvisorPreview }) {
  const debug = proposals.debug;
  if (!debug) return null;
  const generated = debug.generatedCount || 0;
  const available = debug.afterMemoryFilter ?? proposals.commandCount;
  const filtered = Math.max(0, generated - available);
  const reasons = Object.entries(debug.rejectionReasons || {});
  const rejections = debug.rejections || [];
  const candidateAttempts = debug.candidateAttempts || [];
  const notProposedCandidates = debug.notProposedCandidates || [];
  const candidateTasks = debug.candidateTasks || [];
  const touchedTasks = debug.touchedTasks || [];
  const generatedCommandTypeCounts = Object.entries(debug.generatedCommandTypeCounts || {});
  const availableCommandTypeCounts = Object.entries(debug.availableCommandTypeCounts || {});
  const tagDecisionReasons = debug.tagDecisions || [];
  const tagDecisionCounts = Object.entries(debug.tagDecisionCounts || {});
  const tagDecisionStatusCounts = Object.entries(debug.tagDecisionStatusCounts || {});
  const availableTags = debug.availableTags || [];
  const selectedTagTasks = debug.selectedTagTasks || [];
  const skippedTagTasks = debug.skippedTagTasks || [];
  const pickedTagCounts = Object.entries(debug.pickedTagCounts || {});
  const tagGeneratedCommands = debug.tagGeneratedCommands || [];
  const tagBatches = debug.tagBatches || [];

  return (
    <details className="advisor-debug-summary">
      <summary>{generated} geradas, {available} disponiveis, {filtered} filtradas</summary>
      <div className="advisor-debug-counts">
        {debug.candidateTaskCount != null ? <span>Candidatas: {debug.candidateTaskCount}</span> : null}
        {debug.candidateUntaggedTaskCount != null ? <span>Sem tags candidatas: {debug.candidateUntaggedTaskCount}</span> : null}
        {debug.generatedUntaggedTaskCount != null ? <span>Sem tags geradas: {debug.generatedUntaggedTaskCount}</span> : null}
        {debug.availableUntaggedTaskCount != null ? <span>Sem tags disponiveis: {debug.availableUntaggedTaskCount}</span> : null}
        {debug.notGeneratedUntaggedTaskCount != null ? <span>Sem tags ignoradas pelo AI: {debug.notGeneratedUntaggedTaskCount}</span> : null}
        {debug.notAvailableUntaggedTaskCount != null ? <span>Sem tags nao disponiveis: {debug.notAvailableUntaggedTaskCount}</span> : null}
        {debug.tagDecisionCount != null ? <span>Decisoes tags: {debug.tagDecisionCount}</span> : null}
        {debug.availableTagCount != null ? <span>Tags enviadas: {debug.availableTagCount}</span> : null}
        {debug.selectedTagTaskCount != null ? <span>Tasks enviadas para tags: {debug.selectedTagTaskCount}</span> : null}
        {debug.selectedUntaggedTagTaskCount != null ? <span>Tasks enviadas sem tags: {debug.selectedUntaggedTagTaskCount}</span> : null}
        {debug.touchedTaskCount != null ? <span>Tocadas pelo AI: {debug.touchedTaskCount}</span> : null}
        {debug.availableTaskCount != null ? <span>Tasks disponiveis: {debug.availableTaskCount}</span> : null}
        {debug.candidateTasksWithoutDueDate != null ? <span>Sem due date: {debug.candidateTasksWithoutDueDate}</span> : null}
        {debug.notProposedCount != null ? <span>Nao propostas: {debug.notProposedCount}</span> : null}
        {debug.notProposedWithoutDueDateCount != null ? <span>Nao propostas sem due date: {debug.notProposedWithoutDueDateCount}</span> : null}
        <span>Acao: {debug.afterActionFilter}</span>
        <span>Calendario: {debug.afterCalendarFilter}</span>
        <span>Tempo futuro: {debug.afterPastFilter}</span>
        <span>Duplicados batch: {debug.afterDuplicateBatchFilter}</span>
        <span>Google/ligacao: {debug.afterExistingGoogleFilter}</span>
        <span>Memoria: {debug.afterMemoryFilter}</span>
        {debug.attempts ? <span>Tentativas: {debug.attempts}</span> : null}
      </div>
      {reasons.length ? (
        <div className="advisor-debug-reasons">
          {reasons.map(([reason, count]) => <span key={reason}>{reason}: {count}</span>)}
        </div>
      ) : <p className="advisor-empty">Sem rejeicoes registadas.</p>}
      {generatedCommandTypeCounts.length ? (
        <div className="advisor-debug-reasons">
          <span>Geradas por tipo</span>
          {generatedCommandTypeCounts.map(([type, count]) => <span key={type}>{type}: {count}</span>)}
        </div>
      ) : null}
      {availableCommandTypeCounts.length ? (
        <div className="advisor-debug-reasons">
          <span>Disponiveis por tipo</span>
          {availableCommandTypeCounts.map(([type, count]) => <span key={type}>{type}: {count}</span>)}
        </div>
      ) : null}
      {tagDecisionCounts.length ? (
        <div className="advisor-debug-reasons">
          <span>Decisoes AI</span>
          {tagDecisionCounts.map(([decision, count]) => <span key={decision}>{decision}: {count}</span>)}
        </div>
      ) : null}
      {tagDecisionStatusCounts.length ? (
        <div className="advisor-debug-reasons">
          <span>Resultado final</span>
          {tagDecisionStatusCounts.map(([status, count]) => <span key={status}>{status}: {count}</span>)}
        </div>
      ) : null}
      {availableTags.length ? (
        <div className="advisor-debug-candidates">
          <strong>Tags disponiveis enviadas ao AI</strong>
          <div className="advisor-debug-tag-cloud">
            {availableTags.slice(0, 120).map((tag) => <span key={`available-tag-${tag}`}>#{tag}</span>)}
          </div>
          {availableTags.length > 120 && <p className="advisor-empty">+{availableTags.length - 120} tags adicionais</p>}
        </div>
      ) : null}
      {pickedTagCounts.length ? (
        <div className="advisor-debug-candidates">
          <strong>Tags escolhidas para sugestao</strong>
          <div className="advisor-debug-tag-cloud selected">
            {pickedTagCounts.map(([tag, count]) => <span key={`picked-tag-${tag}`}>#{tag}{Number(count) > 1 ? ` x${count}` : ''}</span>)}
          </div>
        </div>
      ) : null}
      {selectedTagTasks.length ? (
        <div className="advisor-debug-candidates">
          <strong>Tasks enviadas para sugestao de tags</strong>
          <ul>
            {selectedTagTasks.slice(0, 50).map((task) => (
              <li key={`selected-tag-task-${task.taskId}`}>
                <span>{task.taskTitle || task.title || task.taskId}</span>
                <small>
                  {task.existingTags?.length ? `atuais: #${task.existingTags.join(' #')}` : 'sem tags'}
                  {task.notesChars ? ` - notas: ${task.notesChars} chars` : ''}
                </small>
              </li>
            ))}
          </ul>
          {selectedTagTasks.length > 50 && <p className="advisor-empty">+{selectedTagTasks.length - 50} tasks enviadas adicionais</p>}
        </div>
      ) : null}
      {tagGeneratedCommands.length ? (
        <div className="advisor-debug-candidates">
          <strong>Comandos finais de tags</strong>
          <ul>
            {tagGeneratedCommands.slice(0, 40).map((command) => (
              <li key={`tag-command-${command.commandId}`}>
                <span>{command.taskTitle || command.taskId}</span>
                <small>{command.patchTags?.length ? `patch.tags: #${command.patchTags.join(' #')}` : 'sem patch.tags'}</small>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {tagDecisionReasons.length ? (
        <div className="advisor-debug-candidates">
          <strong>Decisoes por task</strong>
          <ul>
            {tagDecisionReasons.slice(0, 40).map((item) => (
              <li key={`tag-decision-${item.taskId}`}>
                <span>{item.taskTitle || item.taskId}</span>
                <small>
                  {item.finalStatus || item.decision} - {item.reason}
                  {item.existingTags?.length ? ` - atuais: #${item.existingTags.join(' #')}` : ' - atuais: sem tags'}
                  {item.suggestedTags?.length ? ` - AI: #${item.suggestedTags.join(' #')}` : ''}
                  {item.newSuggestedTags?.length ? ` - novas: #${item.newSuggestedTags.join(' #')}` : ''}
                  {item.rejectionReason ? ` - motivo final: ${item.rejectionReason}` : ''}
                </small>
              </li>
            ))}
          </ul>
          {tagDecisionReasons.length > 40 && <p className="advisor-empty">+{tagDecisionReasons.length - 40} decisoes adicionais</p>}
        </div>
      ) : null}
      {tagBatches.length ? (
        <div className="advisor-debug-candidates">
          <strong>Batches enviados ao AI</strong>
          <ul>
            {tagBatches.slice(0, 20).map((batch) => (
              <li key={`tag-batch-${batch.batchIndex}`}>
                <span>Batch {batch.batchIndex}/{batch.batchCount}</span>
                <small>{batch.taskCount} tasks - {batch.decisions?.length || 0} decisoes recebidas</small>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {skippedTagTasks.length ? (
        <div className="advisor-debug-candidates">
          <strong>Tasks nao enviadas para tags</strong>
          <ul>
            {skippedTagTasks.slice(0, 30).map((task) => (
              <li key={`skipped-tag-task-${task.taskId}`}>
                <span>{task.taskTitle || task.title || task.taskId}</span>
                <small>{task.reason || 'nao selecionada'} - {task.status || '-'}</small>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {candidateAttempts.length ? (
        <div className="advisor-debug-candidates">
          <strong>Candidatas por tentativa</strong>
          {candidateAttempts.map((attempt) => (
            <article key={`candidate-attempt-${attempt.attempt}`}>
              <div>
                <b>Tentativa {attempt.attempt}</b>
                <span>{attempt.candidateCount} candidatas</span>
                <span>{attempt.candidateTasksWithoutDueDate} sem due date</span>
                <span>{attempt.returnedTaskCount} devolvidas pelo modelo</span>
                <span>{attempt.notProposedCount} nao propostas</span>
              </div>
              {attempt.notProposedCandidates?.length ? (
                <ul>
                  {attempt.notProposedCandidates.slice(0, 20).map((task) => (
                    <li key={`${attempt.attempt}-${task.taskId}`}>
                      <span>{task.taskTitle || task.title || task.taskId}</span>
                      <small>p{task.priority ?? '-'} - {task.status || '-'} - {task.dueDateTime || 'sem due date'}</small>
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
      {touchedTasks.length ? (
        <div className="advisor-debug-candidates">
          <strong>Tasks tocadas pelo AI</strong>
          <ul>
            {touchedTasks.slice(0, 40).map((task) => (
              <li key={`touched-${task.taskId}`}>
                <span>{task.taskTitle || task.title || task.taskId}</span>
                <small>p{task.priority ?? '-'} - {task.status || '-'} - {task.dueDateTime || 'sem due date'}</small>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {candidateTasks.length ? (
        <div className="advisor-debug-candidates">
          <strong>Candidatas analisadas</strong>
          <ul>
            {candidateTasks.slice(0, 40).map((task) => (
              <li key={`candidate-${task.taskId}`}>
                <span>{task.taskTitle || task.title || task.taskId}</span>
                <small>p{task.priority ?? '-'} - {task.status || '-'} - {task.dueDateTime || 'sem due date'}</small>
              </li>
            ))}
          </ul>
          {candidateTasks.length > 40 && <p className="advisor-empty">+{candidateTasks.length - 40} candidatas adicionais</p>}
        </div>
      ) : null}
      {notProposedCandidates.length ? (
        <div className="advisor-debug-candidates">
          <strong>Nao propostas pelo modelo neste request</strong>
          <ul>
            {notProposedCandidates.slice(0, 40).map((task) => (
              <li key={`not-proposed-${task.taskId}`}>
                <span>{task.taskTitle || task.title || task.taskId}</span>
                <small>p{task.priority ?? '-'} - {task.status || '-'} - {task.dueDateTime || 'sem due date'}</small>
              </li>
            ))}
          </ul>
          {notProposedCandidates.length > 40 && <p className="advisor-empty">+{notProposedCandidates.length - 40} candidatas nao propostas</p>}
        </div>
      ) : null}
      {rejections.length ? (
        <div className="advisor-debug-rejections">
          {rejections.slice(0, 30).map((item, index) => (
            <article key={`${item.reason}-${item.commandId || item.taskId || index}`}>
              <strong>{item.reason}</strong>
              <div>
                <span>{item.taskTitle || item.summary || item.taskId || item.commandId || 'Sem task'}</span>
                {item.details ? <small>{item.details}</small> : null}
                {item.memoryRules?.length ? (
                  <div className="advisor-debug-memory">
                    {item.memoryRules.map((rule, ruleIndex) => (
                      <section key={`${item.commandId || item.taskId || index}-memory-${ruleIndex}`}>
                        <b>{rule.ruleType || 'memory'}{rule.supportCount ? ` · ${rule.supportCount}x` : ''}</b>
                        {rule.summary ? <p>{rule.summary}</p> : null}
                        {rule.titleKeywords?.length ? <small>keywords: {rule.titleKeywords.join(', ')}</small> : null}
                        {rule.matchedReasons?.length ? <small>motivos: {rule.matchedReasons.join(', ')}</small> : null}
                      </section>
                    ))}
                  </div>
                ) : null}
              </div>
            </article>
          ))}
          {rejections.length > 30 && <p className="advisor-empty">+{rejections.length - 30} rejeicoes adicionais</p>}
        </div>
      ) : null}
    </details>
  );
}

function decisionSummaryItems(text: string) {
  const normalized = text.replace(/\r/g, '\n').trim();
  const numbered = [...normalized.matchAll(/(?:^|\n)\s*\d+[.)]\s*([\s\S]*?)(?=\n\s*\d+[.)]\s*|$)/g)]
    .map((match) => match[1].replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (numbered.length) return numbered;
  return normalized
    .split(/\n+|(?=\s*\d+[.)]\s+)/)
    .map((item) => item.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter(Boolean);
}

function decisionDetailLabel(detail: string) {
  const value = detail.toLocaleLowerCase();
  if (/\b(\d{1,2}:\d{2}|start|end|inicio|início|fim|hora|slot|agend)/i.test(detail)) return 'Horario';
  if (/busy|ocupad|livre|free|calendar|calendario|calendário|google|evento/i.test(detail)) return 'Agenda';
  if (/rule|regra|constraint|stored|agenda ai|afetou|affected/i.test(detail)) return 'Regras';
  if (/due|prazo|priority|prioridade|duration|dura[cç][aã]o|sinal/i.test(detail)) return 'Sinais';
  if (value.includes('porque') || value.includes('why') || value.includes('selected') || value.includes('escolh')) return 'Motivo';
  return 'Detalhe';
}

function splitDecisionSummaryItem(item: string) {
  const cleaned = item.replace(/\s+/g, ' ').trim();
  const colonIndex = cleaned.indexOf(':');
  const sentenceMatch = cleaned.match(/[.!?]\s/);
  const titleEnd = colonIndex > 5 && colonIndex < 120
    ? colonIndex
    : sentenceMatch?.index != null && sentenceMatch.index < 120
      ? sentenceMatch.index + 1
      : Math.min(cleaned.length, 110);
  const title = cleaned.slice(0, titleEnd).replace(/[:;,.\s]+$/, '').trim() || 'Decisao de agendamento';
  const rest = cleaned.slice(titleEnd + (cleaned[titleEnd] === ':' ? 1 : 0)).trim();
  const details = rest
    .split(/(?:;|\.\s+|\s+\|\s+)/)
    .map((part) => part.trim().replace(/[.;]+$/, ''))
    .filter(Boolean);
  return { title, details: details.length ? details : [cleaned] };
}

function AdvisorDecisionSummary({ summary, enabled }: { summary: string; enabled: boolean }) {
  if (!enabled) return <p>{summary || 'Reve e aplica apenas o que fizer sentido.'}</p>;
  const text = summary || 'Reve e aplica apenas o que fizer sentido.';
  const items = decisionSummaryItems(text);
  if (!items.length) return <p className="advisor-decision-summary-fallback">{text}</p>;
  return (
    <div className="advisor-decision-summary" aria-label="Resumo das decisoes de agendamento">
      <header>
        <span>Resumo das decisoes</span>
        <strong>{items.length} {items.length === 1 ? 'decisao' : 'decisoes'}</strong>
      </header>
      <div className="advisor-decision-list">
        {items.map((item, index) => {
          const decision = splitDecisionSummaryItem(item);
          return (
            <article className="advisor-decision-card" key={`${index}-${item.slice(0, 20)}`}>
              <b>{index + 1}</b>
              <div>
                <strong>{decision.title}</strong>
                <dl>
                  {decision.details.map((detail, detailIndex) => (
                    <div key={`${index}-${detailIndex}-${detail.slice(0, 12)}`}>
                      <dt>{decisionDetailLabel(detail)}</dt>
                      <dd>{detail}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
function SchedulerDebugReveal({ debug }: { debug?: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!debug) return null;
  const debugJson = JSON.stringify(debug, null, 2);
  async function copyDebugJson() {
    await navigator.clipboard.writeText(debugJson);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }
  return (
    <section className="advisor-scheduler-debug" aria-label="Scheduler debug JSON">
      <div>
        <strong>Scheduler debug</strong>
        <span>Request, response, regras, rotinas, busy events e candidatos usados neste agendamento.</span>
      </div>
      <div className="advisor-scheduler-debug-actions">
        <button type="button" className="button secondary small" onClick={() => setOpen((current) => !current)}>{open ? 'Ocultar debug' : 'Reveal debug JSON'}</button>
        <button type="button" className="button ghost small" onClick={copyDebugJson}>{copied ? 'Copiado' : 'Copiar debug JSON'}</button>
      </div>
      {open && <pre>{debugJson}</pre>}
    </section>
  );
}

function AdvisorJsonReveal({ proposals }: { proposals: AdvisorPreview }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const advisorJson = JSON.stringify(proposals, null, 2);
  async function copyAdvisorJson() {
    await navigator.clipboard.writeText(advisorJson);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }
  return (
    <section className="advisor-scheduler-debug" aria-label="Advisor response JSON">
      <div>
        <strong>Advisor JSON</strong>
        <span>Resposta completa recebida pelo frontend, incluindo propostas, comandos originais e debug.</span>
      </div>
      <div className="advisor-scheduler-debug-actions">
        <button type="button" className="button secondary small" onClick={() => setOpen((current) => !current)}>{open ? 'Ocultar JSON' : 'Ver JSON'}</button>
        <button type="button" className="button ghost small" onClick={copyAdvisorJson}>{copied ? 'Copiado' : 'Copiar JSON'}</button>
      </div>
      {open && <pre>{advisorJson}</pre>}
    </section>
  );
}

function EmptyAdvisorProposalReason({ proposals, action }: { proposals: AdvisorPreview; action?: string }) {
  const debug = proposals.debug;
  if (action === 'suggest_tags') {
    const reason = debug?.noSuggestionReason || proposals.summary || 'O AI nao devolveu sugestoes de tags aplicaveis.';
    return (
      <div className="advisor-empty advisor-empty-diagnostic">
        <strong>Sem sugestoes de tags.</strong>
        <span>{reason}</span>
        {debug?.candidateTaskCount != null && (
          <small>
            {debug.candidateTaskCount} candidatas analisadas
            {debug.candidateUntaggedTaskCount != null ? `, ${debug.candidateUntaggedTaskCount} sem tags` : ''}
            {debug.generatedCount != null ? `, ${debug.generatedCount} comandos devolvidos pelo AI` : ''}.
          </small>
        )}
      </div>
    );
  }
  if (debug?.noSuggestionReason) {
    return (
      <div className="advisor-empty advisor-empty-diagnostic">
        <strong>Sem propostas disponiveis.</strong>
        <span>{debug.noSuggestionReason}</span>
        {debug.candidateTaskCount != null && (
          <small>
            {debug.candidateTaskCount} candidatas analisadas
            {debug.generatedCount != null ? `, ${debug.generatedCount} comandos devolvidos pelo AI` : ''}
            {debug.afterMemoryFilter != null ? `, ${debug.afterMemoryFilter} disponiveis depois dos filtros` : ''}.
          </small>
        )}
      </div>
    );
  }
  return <p className="advisor-empty">{proposals.summary || 'O AI nao propos acoes aplicaveis.'}</p>;
}

function tagPatchFromCommand(command?: AiCommand | null) {
  return Array.isArray(command?.patch?.tags) ? command.patch.tags.map((tag) => String(tag).trim()).filter(Boolean) : [];
}

function isTagUpdateProposal(proposal: AdvisorPreview['commands'][number], rawCommand?: AiCommand | null) {
  return proposal.type === 'update_task' && tagPatchFromCommand(rawCommand).length > 0;
}

function sameStringList(left: string[], right: string[]) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function customizeTagCommand(rawCommand: AiCommand, selectedTags: string[]) {
  return {
    ...rawCommand,
    patch: {
      ...(rawCommand.patch || {}),
      tags: selectedTags
    }
  };
}

function AdvisorTagChoice({
  tags,
  selectedTags,
  disabled,
  onChange
}: {
  tags: string[];
  selectedTags: string[];
  disabled: boolean;
  onChange: (tags: string[]) => void;
}) {
  if (!tags.length) return null;
  const selectedSet = new Set(selectedTags.map((tag) => tag.toLocaleLowerCase()));
  function toggleTag(tag: string) {
    const isSelected = selectedSet.has(tag.toLocaleLowerCase());
    onChange(isSelected ? selectedTags.filter((item) => item.toLocaleLowerCase() !== tag.toLocaleLowerCase()) : [...selectedTags, tag]);
  }
  return (
    <div className="advisor-tag-choice">
      <div>
        <span>Tags a aplicar</span>
        <button type="button" className="button ghost tiny" onClick={() => onChange(tags)} disabled={disabled || selectedTags.length === tags.length}>
          Todas
        </button>
      </div>
      <div className="advisor-tag-choice-list">
        {tags.map((tag) => {
          const selected = selectedSet.has(tag.toLocaleLowerCase());
          return (
            <button
              type="button"
              key={`advisor-tag-choice-${tag}`}
              className={selected ? 'is-selected' : ''}
              onClick={() => toggleTag(tag)}
              disabled={disabled}
              aria-pressed={selected}
            >
              #{tag}
            </button>
          );
        })}
      </div>
      {!selectedTags.length && <small>Escolhe pelo menos uma tag para aceitar esta proposta.</small>}
    </div>
  );
}
export function AdvisorProposalBuffer({
  allTasks = [],
  googleCalendars = [],
  proposals,
  proposalStatuses,
  proposalFeedbackStatuses,
  interactionFeedbackSaved,
  action,
  applyingProposalId,
  applyingAllProposals,
  calendarWriteReady,
  onConnectGoogle,
  onApplyProposal,
  onApplyProposals,
  onIgnoreProposal,
  onApplyAllProposals,
  onIgnoreAllProposals,
  onClearProposals,
  onChangeProposalCalendar,
  onSaveProposalFeedback,
  onSaveInteractionFeedback,
  onOpenTask
}: {
  allTasks?: Task[];
  googleCalendars?: GoogleCalendar[];
  proposals: AdvisorPreview | null;
  proposalStatuses: ProposalStatuses;
  proposalFeedbackStatuses: ProposalFeedbackStatuses;
  interactionFeedbackSaved: boolean;
  action?: string;
  applyingProposalId: string | null;
  applyingAllProposals: boolean;
  calendarWriteReady: boolean;
  onConnectGoogle: () => void;
  onApplyProposal: (commandId: string, commandOverride?: AiCommand) => void;
  onApplyProposals: (commandIds: string[], commandOverrides?: Record<string, AiCommand>) => void;
  onIgnoreProposal: (commandId: string) => void;
  onApplyAllProposals: (commandOverrides?: Record<string, AiCommand>) => void;
  onIgnoreAllProposals: () => void;
  onClearProposals: () => void;
  onChangeProposalCalendar: (commandId: string, calendarId: string, calendarSummary: string) => void;
  onSaveProposalFeedback: (commandId: string, feedback: AdvisorFeedbackInput['feedback']) => Promise<void>;
  onSaveInteractionFeedback: (feedback: AdvisorFeedbackInput['feedback']) => Promise<void>;
  onOpenTask: (taskId: string) => void;
}) {
  const commands = proposals?.commands || [];
  if (!proposals) return null;
  const visibleCommands = commands.filter((command) => !proposalStatuses[command.id]);
  const pendingCount = visibleCommands.length;
  const [selectedProposalIds, setSelectedProposalIds] = useState<string[]>([]);
  const [tagSelections, setTagSelections] = useState<Record<string, string[]>>({});
  const rawCommandById = useMemo(() => {
    const map = new Map<string, AiCommand>();
    const rawCommands = proposals.rawCommands || [];
    commands.forEach((command, index) => {
      const rawCommand = rawCommands[index];
      if (rawCommand) map.set(command.id, rawCommand);
    });
    return map;
  }, [commands, proposals.rawCommands]);
  const visibleIds = useMemo(() => new Set(visibleCommands.map((command) => command.id)), [visibleCommands]);
  const selectedVisibleIds = selectedProposalIds.filter((id) => visibleIds.has(id));
  const selectedCount = selectedVisibleIds.length;
  const hasCalendarProposal = commands.some((command) => command.type === 'create_calendar_event');
  const calendarPermissionBlocked = hasCalendarProposal && !calendarWriteReady;
  const schedulerDebug = proposals.debug?.schedulerDebug;
  const calendarDayGroups = useMemo(() => {
    const groups = new Map<string, AdvisorPreview['commands']>();
    for (const command of visibleCommands) {
      if (command.type !== 'create_calendar_event') continue;
      const day = proposalDayKey(command);
      if (!day) continue;
      groups.set(day, [...(groups.get(day) || []), command]);
    }
    return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [visibleCommands]);

  function toggleSelectedProposal(commandId: string) {
    setSelectedProposalIds((current) => current.includes(commandId) ? current.filter((id) => id !== commandId) : [...current, commandId]);
  }

  function setAllVisibleSelected(selected: boolean) {
    setSelectedProposalIds(selected ? visibleCommands.map((command) => command.id) : []);
  }

  function proposedTagsForCommand(commandId: string) {
    return tagPatchFromCommand(rawCommandById.get(commandId));
  }

  function selectedTagsForCommand(commandId: string) {
    return tagSelections[commandId] || proposedTagsForCommand(commandId);
  }

  function applicableCommandIds(commandIds: string[]) {
    return commandIds.filter((commandId) => {
      const rawCommand = rawCommandById.get(commandId);
      const proposal = commands.find((command) => command.id === commandId);
      if (!proposal || !isTagUpdateProposal(proposal, rawCommand)) return true;
      return selectedTagsForCommand(commandId).length > 0;
    });
  }

  function updateTagSelection(commandId: string, tags: string[]) {
    const proposedTags = proposedTagsForCommand(commandId);
    setTagSelections((current) => {
      const next = { ...current };
      if (sameStringList(tags, proposedTags)) {
        delete next[commandId];
      } else {
        next[commandId] = tags;
      }
      return next;
    });
  }

  function buildCommandOverrides(commandIds: string[]) {
    const overrides: Record<string, AiCommand> = {};
    for (const commandId of commandIds) {
      const rawCommand = rawCommandById.get(commandId);
      const proposedTags = proposedTagsForCommand(commandId);
      if (!rawCommand || !proposedTags.length) continue;
      const selectedTags = selectedTagsForCommand(commandId);
      if (!selectedTags.length) continue;
      if (!sameStringList(selectedTags, proposedTags)) {
        overrides[commandId] = customizeTagCommand(rawCommand, selectedTags);
      }
    }
    return overrides;
  }

  function applySelectedProposals() {
    const applicableIds = applicableCommandIds(selectedVisibleIds);
    onApplyProposals(applicableIds, buildCommandOverrides(applicableIds));
    setSelectedProposalIds([]);
  }

  function applyDayProposals(commandIds: string[]) {
    const applicableIds = applicableCommandIds(commandIds);
    onApplyProposals(applicableIds, buildCommandOverrides(applicableIds));
    setSelectedProposalIds((current) => current.filter((id) => !commandIds.includes(id)));
  }

  function applyAllVisibleProposals() {
    const commandIds = applicableCommandIds(visibleCommands.map((command) => command.id));
    onApplyProposals(commandIds, buildCommandOverrides(commandIds));
  }

  function applyOneProposal(commandId: string) {
    const overrides = buildCommandOverrides([commandId]);
    onApplyProposal(commandId, overrides[commandId]);
  }

  return (
    <section className="advisor-buffer" aria-label="Propostas do assistente">
      <header>
        <div>
          <h3>Propostas para validar</h3>
        </div>
        <div className="advisor-buffer-actions">
          <button type="button" className="button primary small" onClick={applyAllVisibleProposals} disabled={!pendingCount || applyingAllProposals || calendarPermissionBlocked}>
            {applyingAllProposals ? 'A aplicar...' : `Aceitar todos${pendingCount ? ` (${pendingCount})` : ''}`}
          </button>
          <button type="button" className="button secondary small" onClick={applySelectedProposals} disabled={!selectedCount || applyingAllProposals || calendarPermissionBlocked}>
            {`Aceitar selecionados${selectedCount ? ` (${selectedCount})` : ''}`}
          </button>
          <button type="button" className="button secondary small" onClick={onIgnoreAllProposals} disabled={!pendingCount || applyingAllProposals}>
            Ignorar todos
          </button>
          <button type="button" className="button secondary small" onClick={onClearProposals}>
            Limpar buffer
          </button>
        </div>
      </header>

      {calendarDayGroups.length > 0 && (
        <div className="advisor-day-commit-bar">
          <span>Commit por dia</span>
          {calendarDayGroups.map(([day, dayCommands]) => (
            <button
              type="button"
              className="button ghost small"
              key={day}
              onClick={() => applyDayProposals(dayCommands.map((command) => command.id))}
              disabled={applyingAllProposals || calendarPermissionBlocked}
            >
              {formatProposalDay(day)} ({dayCommands.length})
            </button>
          ))}
        </div>
      )}

      {calendarPermissionBlocked && (
        <div className="advisor-permission-warning">
          <span>O Google precisa de permissao de escrita no calendario antes de criar eventos.</span>
          <button type="button" className="button secondary small" onClick={onConnectGoogle}>
            Reconectar Google
          </button>
        </div>
      )}

      <SchedulerDebugReveal debug={schedulerDebug} />

      <AdvisorJsonReveal proposals={proposals} />

      <AdvisorDebugSummary proposals={proposals} />

      <AdvisorInteractionFeedback saved={interactionFeedbackSaved} action={action} onSave={onSaveInteractionFeedback} />

      {visibleCommands.length ? (
        <>
          <div className="advisor-selection-bar">
            <label>
              <input
                type="checkbox"
                checked={pendingCount > 0 && selectedCount === pendingCount}
                onChange={(event) => setAllVisibleSelected(event.target.checked)}
              />
              Selecionar visiveis
            </label>
            <span>{selectedCount} selecionadas</span>
          </div>
          <div className="advisor-proposal-list">
          {visibleCommands.map((proposal) => {
            const needsCalendarPermission = proposal.type === 'create_calendar_event' && !calendarWriteReady;
            const disabled = applyingProposalId === proposal.id || applyingAllProposals || needsCalendarPermission;
            const affectedTitle = affectedCardTitle(proposal);
            const calendarEvent = (proposal.changes as ObjectRecord | undefined)?.calendarEvent as ObjectRecord | undefined;
            const proposalCalendarId = String(calendarEvent?.calendarId || '');
            const rawCommand = rawCommandById.get(proposal.id);
            const proposedTags = proposedTagsForCommand(proposal.id);
            const selectedTags = selectedTagsForCommand(proposal.id);
            const isTagProposal = isTagUpdateProposal(proposal, rawCommand);
            const noTagsSelected = isTagProposal && selectedTags.length === 0;

            return (
              <article className={`advisor-proposal ${selectedVisibleIds.includes(proposal.id) ? 'is-selected' : ''}`} key={proposal.id}>
                <div className="advisor-proposal-main">
                  <label className="advisor-proposal-select">
                    <input type="checkbox" checked={selectedVisibleIds.includes(proposal.id)} onChange={() => toggleSelectedProposal(proposal.id)} />
                    <span>Selecionar</span>
                  </label>
                  <span className="advisor-command-type">{COMMAND_LABELS[proposal.type] || proposal.type}</span>
                  <div className="advisor-affected-card">
                    <span>{proposal.type === 'create_task' || proposal.type === 'create_calendar_event' ? 'Vai criar' : 'Afeta'}</span>
                    <strong>{affectedTitle}</strong>
                  </div>
                  <h4>{proposal.summary}</h4>
                  <p>{proposal.reason}</p>
                  {proposal.alreadyExists && <small>Esta proposta ja existe ou esta duplicada.</small>}
                  <ProposalChanges proposal={proposal} allTasks={allTasks} />
                  {isTagProposal && (
                    <AdvisorTagChoice
                      tags={proposedTags}
                      selectedTags={selectedTags}
                      disabled={disabled}
                      onChange={(tags) => updateTagSelection(proposal.id, tags)}
                    />
                  )}
                  {proposal.type === 'create_calendar_event' && googleCalendars.length > 0 && (
                    <label className="advisor-calendar-select">
                      <span>Calendario destino</span>
                      <select
                        value={proposalCalendarId}
                        onChange={(event) => {
                          const calendar = googleCalendars.find((item) => item.id === event.target.value);
                          onChangeProposalCalendar(proposal.id, event.target.value, calendar?.summary || event.target.value);
                        }}
                      >
                        {googleCalendars.map((calendar) => (
                          <option key={calendar.id} value={calendar.id}>{calendar.summary}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  <AdvisorProposalFeedback
                    proposal={proposal}
                    saved={proposalFeedbackStatuses[proposal.id] === 'saved'}
                    googleCalendars={googleCalendars}
                    onSave={(feedback) => onSaveProposalFeedback(proposal.id, feedback)}
                  />
                </div>

                <div className="advisor-proposal-actions">
                  {proposal.taskId && (
                    <button type="button" className="button ghost small" onClick={() => onOpenTask(proposal.taskId as string)}>
                      Abrir task
                    </button>
                  )}
                  <button type="button" className="button primary small" onClick={() => applyOneProposal(proposal.id)} disabled={disabled || noTagsSelected}>
                    {needsCalendarPermission ? 'Requer Google' : applyingProposalId === proposal.id ? 'A aplicar...' : 'Aceitar'}
                  </button>
                  <button type="button" className="button secondary small" onClick={() => onIgnoreProposal(proposal.id)} disabled={disabled}>
                    Ignorar
                  </button>
                </div>
              </article>
            );
          })}
          </div>
        </>
      ) : (
        <EmptyAdvisorProposalReason proposals={proposals} action={action} />
      )}
    </section>
  );
}

function formatMemoryRule(rule: AdvisorMemoryRule) {
  const parts = [];
  if (rule.rule.avoidTags?.length) parts.push(`evitar: ${rule.rule.avoidTags.map((tag) => `#${tag}`).join(', ')}`);
  if (rule.rule.preferTags?.length) parts.push(`preferir: ${rule.rule.preferTags.map((tag) => `#${tag}`).join(', ')}`);
  if (rule.rule.tagVolume && rule.rule.tagVolume !== 'ok') parts.push(rule.rule.tagVolume === 'less' ? 'menos tags' : 'mais tags');
  if (rule.rule.avoidSimilarSuggestions) parts.push('evitar sugestoes parecidas');
  if (rule.rule.priorityDirection === 'too_high') parts.push('prioridade alta demais');
  if (rule.rule.priorityDirection === 'too_low') parts.push('prioridade baixa demais');
  if (rule.rule.taskAgeImportance === 'too_much') parts.push('menos peso na antiguidade');
  if (rule.rule.taskAgeImportance === 'too_little') parts.push('mais peso na antiguidade');
  if (rule.rule.overdueImportance === 'too_much') parts.push('menos peso no atraso');
  if (rule.rule.overdueImportance === 'too_little') parts.push('mais peso no atraso');
  if (rule.rule.dueDateDirection === 'too_early') parts.push('prazos cedo demais');
  if (rule.rule.dueDateDirection === 'too_late') parts.push('prazos tarde demais');
  if (rule.rule.calendarDurationDirection === 'too_short') parts.push('eventos curtos demais');
  if (rule.rule.calendarDurationDirection === 'too_long') parts.push('eventos longos demais');
  if (rule.rule.unnecessaryEvent) parts.push('evitar eventos desnecessarios');
  if (rule.rule.wrongCalendar) parts.push('rever calendario');
  if (rule.rule.preferredCalendarSummary) parts.push(`preferir calendario: ${rule.rule.preferredCalendarSummary}`);
  if (!rule.rule.preferredCalendarSummary && rule.rule.preferredCalendarId) parts.push(`preferir calendario: ${rule.rule.preferredCalendarId}`);
  if (rule.rule.shouldBeUrgent) parts.push('devia ser urgente');
  if (rule.rule.shouldBeLowerPriority) parts.push('devia baixar prioridade');
  if (rule.rule.askForMoreContext) parts.push('pedir mais contexto');
  return parts.length ? parts.join(' · ') : 'Regra geral de sugestao';
}

function AdvisorMemoryPanel({
  rules,
  loading,
  onRefresh,
  onForget
}: {
  rules: AdvisorMemoryRule[];
  loading: boolean;
  onRefresh: () => void;
  onForget: (id: string) => void;
}) {
  return (
    <details className="advisor-memory">
      <summary>Memoria aprendida</summary>
      <div className="advisor-memory-actions">
        <button type="button" className="button secondary small" onClick={onRefresh} disabled={loading}>
          {loading ? 'A carregar...' : 'Atualizar memoria'}
        </button>
      </div>
      {rules.length ? (
        <div className="advisor-memory-list">
          {rules.map((rule) => (
            <article key={rule.id}>
              <div>
                <strong>{rule.titleFingerprint || 'Regra global'}</strong>
                <p>{formatMemoryRule(rule)}</p>
                <small>{rule.action || 'todas'} · {rule.ruleType} · {rule.supportCount} feedback</small>
              </div>
              <button type="button" className="button ghost small" onClick={() => onForget(rule.id)}>
                Esquecer
              </button>
            </article>
          ))}
        </div>
      ) : (
        <p className="advisor-empty">Sem regras de memoria carregadas.</p>
      )}
    </details>
  );
}

export default function AdvisorPanel({
  allTasks = [],
  advice,
  loading,
  proposals,
  currentAction,
  proposalStatuses,
  proposalFeedbackStatuses,
  interactionFeedbackSaved,
  memoryRules,
  memoryLoading,
  applyingProposalId,
  applyingAllProposals,
  googleStatus,
  googleCalendars,
  advisorDefaultCalendarId,
  onRefresh,
  onRequestActions,
  onConnectGoogle,
  onApplyProposal,
  onApplyProposals,
  onIgnoreProposal,
  onApplyAllProposals,
  onIgnoreAllProposals,
  onClearProposals,
  onAdvisorDefaultCalendarChange,
  onChangeProposalCalendar,
  onSaveProposalFeedback,
  onSaveInteractionFeedback,
  onRefreshMemory,
  onForgetMemory,
  onOpenTask
}: AdvisorPanelProps) {
  const actions = (advice?.actions || []) as AdvisorActionItem[];
  const blockers = (advice?.blockers || []) as AdvisorActionItem[];
  const calendarWriteReady = advisorCalendarWriteReady(googleStatus);

  return (
    <section className="advisor-panel" aria-label="Assistente de trabalho">
      <AdvisorPanelHeader
        loading={loading}
        googleStatus={googleStatus}
        googleCalendars={googleCalendars}
        advisorDefaultCalendarId={advisorDefaultCalendarId}
        onRefresh={onRefresh}
        onRequestActions={onRequestActions}
        onConnectGoogle={onConnectGoogle}
        onAdvisorDefaultCalendarChange={onAdvisorDefaultCalendarChange}
      />

      {/* <AdvisorMemoryPanel
        rules={memoryRules}
        loading={memoryLoading}
        onRefresh={onRefreshMemory}
        onForget={onForgetMemory}
      /> */}

      <AdvisorProposalBuffer
        allTasks={allTasks}
        googleCalendars={googleCalendars}
        proposals={proposals}
        action={currentAction}
        proposalStatuses={proposalStatuses}
        proposalFeedbackStatuses={proposalFeedbackStatuses}
        interactionFeedbackSaved={interactionFeedbackSaved}
        applyingProposalId={applyingProposalId}
        applyingAllProposals={applyingAllProposals}
        calendarWriteReady={calendarWriteReady}
        onConnectGoogle={onConnectGoogle}
        onApplyProposal={onApplyProposal}
        onApplyProposals={onApplyProposals}
        onIgnoreProposal={onIgnoreProposal}
        onApplyAllProposals={onApplyAllProposals}
        onIgnoreAllProposals={onIgnoreAllProposals}
        onClearProposals={onClearProposals}
        onChangeProposalCalendar={onChangeProposalCalendar}
        onSaveProposalFeedback={onSaveProposalFeedback}
        onSaveInteractionFeedback={onSaveInteractionFeedback}
        onOpenTask={onOpenTask}
      />

      {advice?.summary ? (
        <p className="advisor-summary">{advice.summary}</p>
      ) : (
        <p className="advisor-summary">Clica em "Gerar conselho" para uma analise sem aplicar alteracoes.</p>
      )}
      {advice?.note && <p className="advisor-note">{advice.note}</p>}

      <AdvisorAdviceGrid actions={actions} blockers={blockers} onOpenTask={onOpenTask} />
    </section>
  );
}

