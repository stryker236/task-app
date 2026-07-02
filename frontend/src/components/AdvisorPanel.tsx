import { useState } from 'react';
import type { Task } from '../../../shared/types';
import type { AdvisorAdvice, AdvisorFeedbackInput, AdvisorMemoryRule, AdvisorPreview } from '../api';

const QUICK_ACTIONS = [
  { key: 'suggest_tags', label: 'Sugerir tags' },
  { key: 'suggest_due_dates', label: 'Sugerir due dates' },
  { key: 'priority_management', label: 'Gestao de prioridades' }
] as const;

const COMMAND_LABELS = {
  update_task: 'Atualizar task',
  add_relation: 'Adicionar relacao',
  create_task: 'Criar task'
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

type AdvisorActionItem = {
  taskId: string;
  title: string;
  urgency: string;
  reason: string;
  nextStep: string;
};

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
  onRefresh: () => void;
  onRequestActions: (action: string) => void;
  onApplyProposal: (commandId: string) => void;
  onIgnoreProposal: (commandId: string) => void;
  onApplyAllProposals: () => void;
  onIgnoreAllProposals: () => void;
  onClearProposals: () => void;
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
  const createdTask = fieldValue(changes?.createdTask, 'title');
  const beforeTitle = fieldValue(changes?.before, 'title');
  const afterTitle = fieldValue(changes?.after, 'title');
  if (proposal.type === 'create_task') return typeof createdTask === 'string' ? createdTask : 'Nova task';
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

function taskTitleFromId(allTasks: Task[], id: string | null) {
  if (!id) return null;
  return allTasks.find((task) => task.id === id)?.title || id;
}

function AdvisorProposalFeedback({
  proposal,
  saved,
  onSave
}: {
  proposal: AdvisorPreview['commands'][number];
  saved: boolean;
  onSave: (feedback: AdvisorFeedbackInput['feedback']) => Promise<void>;
}) {
  const tags = proposedTags(proposal);
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
  const [shouldBeUrgent, setShouldBeUrgent] = useState(false);
  const [shouldBeLowerPriority, setShouldBeLowerPriority] = useState(false);
  const [missingContext, setMissingContext] = useState(false);
  const priorityProposal = isPriorityProposal(proposal);
  const dueDateProposal = isDueDateProposal(proposal);

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
      ) : tags.length > 0 && (
        <div className="advisor-feedback-tags">
          <span>Tags boas</span>
          {tags.map((tag) => <label key={`good-${tag}`}><input type="checkbox" checked={goodTags.includes(tag)} onChange={() => toggle(goodTags, setGoodTags, tag)} /> #{tag}</label>)}
          <span>Tags más</span>
          {tags.map((tag) => <label key={`bad-${tag}`}><input type="checkbox" checked={badTags.includes(tag)} onChange={() => toggle(badTags, setBadTags, tag)} /> #{tag}</label>)}
        </div>
      )}

      {!priorityProposal && !dueDateProposal && <div className="advisor-feedback-grid">
        <label><input type="radio" checked={tagVolume === 'more'} onChange={() => setTagVolume('more')} /> Mais tags</label>
        <label><input type="radio" checked={tagVolume === 'ok'} onChange={() => setTagVolume('ok')} /> Quantidade ok</label>
        <label><input type="radio" checked={tagVolume === 'less'} onChange={() => setTagVolume('less')} /> Menos tags</label>
      </div>}

      <div className="advisor-feedback-grid">
        <label><input type="checkbox" checked={wrongReason} onChange={(event) => setWrongReason(event.target.checked)} /> Razão fraca</label>
        {!priorityProposal && !dueDateProposal && <label><input type="checkbox" checked={wrongPriority} onChange={(event) => setWrongPriority(event.target.checked)} /> Prioridade errada</label>}
        <label><input type="checkbox" checked={wrongDeadline} onChange={(event) => setWrongDeadline(event.target.checked)} /> Prazo errado</label>
        <label><input type="checkbox" checked={missingContext} onChange={(event) => setMissingContext(event.target.checked)} /> Devia pedir contexto</label>
      </div>

      <button
        type="button"
        className="button secondary small"
        onClick={() => onSave({
          overall,
          tagVolume: priorityProposal || dueDateProposal ? 'ok' : tagVolume,
          goodTags: priorityProposal || dueDateProposal ? [] : goodTags,
          badTags: priorityProposal || dueDateProposal ? [] : badTags,
          wrongReason,
          wrongPriority: priorityProposal ? priorityDirection !== 'ok' || wrongPriority : wrongPriority,
          wrongDeadline: dueDateProposal ? dueDateDirection !== 'ok' || wrongDeadline : wrongDeadline,
          priorityDirection,
          taskAgeImportance,
          overdueImportance,
          dueDateDirection,
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
  const [missingContext, setMissingContext] = useState(false);
  const priorityInteraction = action === 'priority_management';
  const dueDateInteraction = action === 'suggest_due_dates';

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
      <div className="advisor-feedback-grid">
        <label><input type="checkbox" checked={wrongReason} onChange={(event) => setWrongReason(event.target.checked)} /> Razao fraca</label>
        {!priorityInteraction && !dueDateInteraction && <label><input type="checkbox" checked={wrongPriority} onChange={(event) => setWrongPriority(event.target.checked)} /> Prioridades erradas</label>}
        <label><input type="checkbox" checked={wrongDeadline} onChange={(event) => setWrongDeadline(event.target.checked)} /> Prazos mal avaliados</label>
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
          wrongDeadline: dueDateInteraction ? dueDateDirection !== 'ok' || wrongDeadline : wrongDeadline,
          priorityDirection,
          taskAgeImportance,
          overdueImportance,
          dueDateDirection,
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

function ProposalChanges({ proposal, allTasks = [] }: { proposal: AdvisorPreview['commands'][number]; allTasks?: Task[] }) {
  const changes = proposal.changes as ObjectRecord | undefined;

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

function AdvisorProposalBuffer({
  allTasks = [],
  proposals,
  proposalStatuses,
  proposalFeedbackStatuses,
  interactionFeedbackSaved,
  action,
  applyingProposalId,
  applyingAllProposals,
  onApplyProposal,
  onIgnoreProposal,
  onApplyAllProposals,
  onIgnoreAllProposals,
  onClearProposals,
  onSaveProposalFeedback,
  onSaveInteractionFeedback,
  onOpenTask
}: {
  allTasks?: Task[];
  proposals: AdvisorPreview | null;
  proposalStatuses: ProposalStatuses;
  proposalFeedbackStatuses: ProposalFeedbackStatuses;
  interactionFeedbackSaved: boolean;
  action?: string;
  applyingProposalId: string | null;
  applyingAllProposals: boolean;
  onApplyProposal: (commandId: string) => void;
  onIgnoreProposal: (commandId: string) => void;
  onApplyAllProposals: () => void;
  onIgnoreAllProposals: () => void;
  onClearProposals: () => void;
  onSaveProposalFeedback: (commandId: string, feedback: AdvisorFeedbackInput['feedback']) => Promise<void>;
  onSaveInteractionFeedback: (feedback: AdvisorFeedbackInput['feedback']) => Promise<void>;
  onOpenTask: (taskId: string) => void;
}) {
  const commands = proposals?.commands || [];
  if (!proposals) return null;
  const pendingCount = commands.filter((command) => !proposalStatuses[command.id]).length;

  return (
    <section className="advisor-buffer" aria-label="Propostas do assistente">
      <header>
        <div>
          <h3>Propostas para validar</h3>
          <p>{proposals.summary || 'Reve e aplica apenas o que fizer sentido.'}</p>
        </div>
        <div className="advisor-buffer-actions">
          <button type="button" className="button primary small" onClick={onApplyAllProposals} disabled={!pendingCount || applyingAllProposals}>
            {applyingAllProposals ? 'A aplicar...' : `Aceitar todos${pendingCount ? ` (${pendingCount})` : ''}`}
          </button>
          <button type="button" className="button secondary small" onClick={onIgnoreAllProposals} disabled={!pendingCount || applyingAllProposals}>
            Ignorar todos
          </button>
          <button type="button" className="button secondary small" onClick={onClearProposals}>
            Limpar buffer
          </button>
        </div>
      </header>

      <AdvisorInteractionFeedback saved={interactionFeedbackSaved} action={action} onSave={onSaveInteractionFeedback} />

      {commands.length ? (
        <div className="advisor-proposal-list">
          {commands.map((proposal) => {
            const status = proposalStatuses[proposal.id];
            const disabled = status === 'accepted' || status === 'ignored' || applyingProposalId === proposal.id || applyingAllProposals;
            const affectedTitle = affectedCardTitle(proposal);

            return (
              <article className={`advisor-proposal ${status ? `is-${status}` : ''}`} key={proposal.id}>
                <div className="advisor-proposal-main">
                  <span className="advisor-command-type">{COMMAND_LABELS[proposal.type] || proposal.type}</span>
                  <div className="advisor-affected-card">
                    <span>{proposal.type === 'create_task' ? 'Vai criar' : 'Afeta'}</span>
                    <strong>{affectedTitle}</strong>
                  </div>
                  <h4>{proposal.summary}</h4>
                  <p>{proposal.reason}</p>
                  {proposal.alreadyExists && <small>Esta relacao ja existe.</small>}
                  <ProposalChanges proposal={proposal} allTasks={allTasks} />
                  <AdvisorProposalFeedback
                    proposal={proposal}
                    saved={proposalFeedbackStatuses[proposal.id] === 'saved'}
                    onSave={(feedback) => onSaveProposalFeedback(proposal.id, feedback)}
                  />
                </div>

                <div className="advisor-proposal-actions">
                  {proposal.taskId && (
                    <button type="button" className="button ghost small" onClick={() => onOpenTask(proposal.taskId as string)}>
                      Abrir task
                    </button>
                  )}
                  <button type="button" className="button primary small" onClick={() => onApplyProposal(proposal.id)} disabled={disabled}>
                    {applyingProposalId === proposal.id ? 'A aplicar...' : status === 'accepted' ? 'Aceite' : 'Aceitar'}
                  </button>
                  <button type="button" className="button secondary small" onClick={() => onIgnoreProposal(proposal.id)} disabled={disabled}>
                    {status === 'ignored' ? 'Ignorada' : 'Ignorar'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="advisor-empty">O AI nao propos acoes aplicaveis.</p>
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
  onRefresh,
  onRequestActions,
  onApplyProposal,
  onIgnoreProposal,
  onApplyAllProposals,
  onIgnoreAllProposals,
  onClearProposals,
  onSaveProposalFeedback,
  onSaveInteractionFeedback,
  onRefreshMemory,
  onForgetMemory,
  onOpenTask
}: AdvisorPanelProps) {
  const actions = (advice?.actions || []) as AdvisorActionItem[];
  const blockers = (advice?.blockers || []) as AdvisorActionItem[];

  return (
    <section className="advisor-panel" aria-label="Assistente de trabalho">
      <header>
        <div>
          <span>Assistente</span>
          <h2>Conselhos e acoes assistidas</h2>
        </div>
        <button type="button" className="button secondary small" onClick={onRefresh} disabled={loading}>
          {loading ? 'A pensar...' : 'Gerar conselho'}
        </button>
      </header>

      <div className="advisor-request-box">
        <label>Acoes do assistente</label>
        <div className="advisor-request-actions">
          {QUICK_ACTIONS.map((action) => (
            <button key={action.key} type="button" className="button secondary small" onClick={() => onRequestActions(action.key)} disabled={loading}>
              {action.label}
            </button>
          ))}
        </div>
        <small>Limite backend: 3 pedidos AI por 10 segundos, por cliente/IP.</small>
      </div>

      <AdvisorMemoryPanel
        rules={memoryRules}
        loading={memoryLoading}
        onRefresh={onRefreshMemory}
        onForget={onForgetMemory}
      />

      <AdvisorProposalBuffer
        allTasks={allTasks}
        proposals={proposals}
        action={currentAction}
        proposalStatuses={proposalStatuses}
        proposalFeedbackStatuses={proposalFeedbackStatuses}
        interactionFeedbackSaved={interactionFeedbackSaved}
        applyingProposalId={applyingProposalId}
        applyingAllProposals={applyingAllProposals}
        onApplyProposal={onApplyProposal}
        onIgnoreProposal={onIgnoreProposal}
        onApplyAllProposals={onApplyAllProposals}
        onIgnoreAllProposals={onIgnoreAllProposals}
        onClearProposals={onClearProposals}
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

      <div className="advisor-grid">
        <div>
          <h3>Proximas acoes</h3>
          {actions.length ? actions.map((item, index) => (
            <button type="button" className="advisor-action" key={`${item.taskId}-${index}`} onClick={() => onOpenTask(item.taskId)}>
              <strong>{index + 1}. {item.title}</strong>
              <span>{item.nextStep}</span>
              <small>{item.urgency} | {item.reason}</small>
            </button>
          )) : <p className="advisor-empty">Sem sugestoes para ja.</p>}
        </div>

        <div>
          <h3>Bloqueios</h3>
          {blockers.length ? blockers.map((item) => (
            <button type="button" className="advisor-blocker" key={item.taskId} onClick={() => onOpenTask(item.taskId)}>
              <strong>{item.title}</strong>
              <span>{item.nextStep}</span>
              <small>{item.reason}</small>
            </button>
          )) : <p className="advisor-empty">Nada bloqueado que precise de atencao.</p>}
        </div>
      </div>
    </section>
  );
}
