import { useEffect, useState } from 'react';
import type { AdvisorMemoryRule, AdvisorMemoryRuleUpdate } from '../api';

type LearnedRulesViewProps = {
  rules: AdvisorMemoryRule[];
  loading: boolean;
  onRefresh: () => void;
  onForget: (id: string) => void;
  onUpdate: (id: string, patch: AdvisorMemoryRuleUpdate) => void | Promise<void>;
};

type MemoryDraft = {
  summary: string;
  context: {
    titleKeywords: string;
    commandTypes: string;
    changedFields: string;
    requiredTags: string;
    statuses: string[];
    hasDueDate: '' | 'true' | 'false';
    isOverdue: '' | 'true' | 'false';
    isBlocked: '' | 'true' | 'false';
  };
  behavior: {
    avoidTags: string;
    preferTags: string;
    tagVolume: '' | 'more' | 'less' | 'ok';
    priorityDirection: '' | 'too_high' | 'too_low' | 'ok';
    taskAgeImportance: '' | 'too_much' | 'too_little' | 'ok';
    overdueImportance: '' | 'too_much' | 'too_little' | 'ok';
    dueDateDirection: '' | 'too_early' | 'too_late' | 'ok';
    calendarDurationDirection: '' | 'too_short' | 'too_long' | 'ok';
    avoidSimilarSuggestions: boolean;
    askForMoreContext: boolean;
    reviewReasoning: boolean;
    reviewPriority: boolean;
    reviewDeadline: boolean;
    unnecessaryEvent: boolean;
    wrongCalendar: boolean;
    shouldBeUrgent: boolean;
    shouldBeLowerPriority: boolean;
  };
};

const STATUS_OPTIONS = ['new', 'in_progress', 'waiting', 'done', 'cancelled'];

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    improve_tasks: 'Melhorar tasks',
    suggest_tags: 'Sugerir tags',
    suggest_due_dates: 'Sugerir due dates',
    priority_management: 'Gestao de prioridades',
    create_followups: 'Criar follow-ups',
    organize_blockers: 'Organizar bloqueios',
    schedule_calendar_events: 'Agendar calendario'
  };
  return labels[action] || action || 'Todas';
}

function ruleTypeLabel(type: string) {
  const labels: Record<string, string> = {
    tag_suggestion: 'Tags',
    priority_suggestion: 'Prioridade',
    due_date_suggestion: 'Prazos',
    calendar_event_suggestion: 'Calendario',
    advisor_interaction: 'Interacao',
    advisor_suggestion: 'Sugestao'
  };
  return labels[type] || type;
}

function ruleBehavior(rule: AdvisorMemoryRule) {
  return { ...rule.rule, ...(rule.rule.behavior || {}) };
}

function ruleContext(rule: AdvisorMemoryRule) {
  return {
    ...(rule.rule.context || {}),
    titleKeywords: rule.rule.context?.titleKeywords || rule.rule.titleKeywords || (rule.titleFingerprint ? rule.titleFingerprint.split(' ') : [])
  };
}

function listText(value: unknown) {
  return Array.isArray(value) ? value.join(', ') : '';
}

function splitList(value: string) {
  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
}

function boolSelect(value: unknown): '' | 'true' | 'false' {
  if (value === true) return 'true';
  if (value === false) return 'false';
  return '';
}

function boolValue(value: '' | 'true' | 'false') {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function draftFromRule(rule: AdvisorMemoryRule): MemoryDraft {
  const context = ruleContext(rule);
  const behavior = ruleBehavior(rule);
  return {
    summary: rule.rule.summary || '',
    context: {
      titleKeywords: listText(context.titleKeywords),
      commandTypes: listText(context.commandTypes),
      changedFields: listText(context.changedFields),
      requiredTags: listText(context.requiredTags),
      statuses: Array.isArray(context.statuses) ? context.statuses.map(String) : [],
      hasDueDate: boolSelect(context.hasDueDate),
      isOverdue: boolSelect(context.isOverdue),
      isBlocked: boolSelect(context.isBlocked)
    },
    behavior: {
      avoidTags: listText(behavior.avoidTags),
      preferTags: listText(behavior.preferTags),
      tagVolume: behavior.tagVolume || '',
      priorityDirection: behavior.priorityDirection || '',
      taskAgeImportance: behavior.taskAgeImportance || '',
      overdueImportance: behavior.overdueImportance || '',
      dueDateDirection: behavior.dueDateDirection || '',
      calendarDurationDirection: behavior.calendarDurationDirection || '',
      avoidSimilarSuggestions: Boolean(behavior.avoidSimilarSuggestions),
      askForMoreContext: Boolean(behavior.askForMoreContext),
      reviewReasoning: Boolean(behavior.reviewReasoning),
      reviewPriority: Boolean(behavior.reviewPriority),
      reviewDeadline: Boolean(behavior.reviewDeadline),
      unnecessaryEvent: Boolean(behavior.unnecessaryEvent),
      wrongCalendar: Boolean(behavior.wrongCalendar),
      shouldBeUrgent: Boolean(behavior.shouldBeUrgent),
      shouldBeLowerPriority: Boolean(behavior.shouldBeLowerPriority)
    }
  };
}

function buildPatch(draft: MemoryDraft): AdvisorMemoryRuleUpdate {
  const context: NonNullable<AdvisorMemoryRuleUpdate['context']> = {};
  const behavior: NonNullable<AdvisorMemoryRuleUpdate['behavior']> = {};
  const titleKeywords = splitList(draft.context.titleKeywords);
  const commandTypes = splitList(draft.context.commandTypes);
  const changedFields = splitList(draft.context.changedFields);
  const requiredTags = splitList(draft.context.requiredTags);
  if (titleKeywords.length) context.titleKeywords = titleKeywords;
  if (commandTypes.length) context.commandTypes = commandTypes;
  if (changedFields.length) context.changedFields = changedFields;
  if (requiredTags.length) context.requiredTags = requiredTags;
  if (draft.context.statuses.length) context.statuses = draft.context.statuses;
  const hasDueDate = boolValue(draft.context.hasDueDate);
  const isOverdue = boolValue(draft.context.isOverdue);
  const isBlocked = boolValue(draft.context.isBlocked);
  if (typeof hasDueDate === 'boolean') context.hasDueDate = hasDueDate;
  if (typeof isOverdue === 'boolean') context.isOverdue = isOverdue;
  if (typeof isBlocked === 'boolean') context.isBlocked = isBlocked;

  const avoidTags = splitList(draft.behavior.avoidTags);
  const preferTags = splitList(draft.behavior.preferTags);
  if (avoidTags.length) behavior.avoidTags = avoidTags;
  if (preferTags.length) behavior.preferTags = preferTags;
  if (draft.behavior.tagVolume) behavior.tagVolume = draft.behavior.tagVolume;
  if (draft.behavior.priorityDirection) behavior.priorityDirection = draft.behavior.priorityDirection;
  if (draft.behavior.taskAgeImportance) behavior.taskAgeImportance = draft.behavior.taskAgeImportance;
  if (draft.behavior.overdueImportance) behavior.overdueImportance = draft.behavior.overdueImportance;
  if (draft.behavior.dueDateDirection) behavior.dueDateDirection = draft.behavior.dueDateDirection;
  if (draft.behavior.calendarDurationDirection) behavior.calendarDurationDirection = draft.behavior.calendarDurationDirection;
  for (const key of ['avoidSimilarSuggestions', 'askForMoreContext', 'reviewReasoning', 'reviewPriority', 'reviewDeadline', 'unnecessaryEvent', 'wrongCalendar', 'shouldBeUrgent', 'shouldBeLowerPriority'] as const) {
    if (draft.behavior[key]) behavior[key] = true;
  }
  return { summary: draft.summary.trim(), context, behavior };
}

function ruleTitle(rule: AdvisorMemoryRule) {
  if (rule.rule.summary) return rule.rule.summary;
  const behavior = formatRule(rule);
  return behavior[0] || 'Regra de feedback AI';
}

function formatRule(rule: AdvisorMemoryRule) {
  const behavior = ruleBehavior(rule);
  const parts = [];
  if (behavior.avoidTags?.length) parts.push(`Evitar ${behavior.avoidTags.map((tag) => `#${tag}`).join(', ')}`);
  if (behavior.preferTags?.length) parts.push(`Preferir ${behavior.preferTags.map((tag) => `#${tag}`).join(', ')}`);
  if (behavior.tagVolume === 'less') parts.push('Sugerir menos tags');
  if (behavior.tagVolume === 'more') parts.push('Sugerir mais tags');
  if (behavior.avoidSimilarSuggestions) parts.push('Evitar sugestoes parecidas');
  if (behavior.priorityDirection === 'too_high') parts.push('Prioridade sugerida tende a ser alta demais');
  if (behavior.priorityDirection === 'too_low') parts.push('Prioridade sugerida tende a ser baixa demais');
  if (behavior.taskAgeImportance === 'too_much') parts.push('Reduzir peso da antiguidade');
  if (behavior.taskAgeImportance === 'too_little') parts.push('Aumentar peso da antiguidade');
  if (behavior.overdueImportance === 'too_much') parts.push('Reduzir peso do atraso');
  if (behavior.overdueImportance === 'too_little') parts.push('Aumentar peso do atraso');
  if (behavior.dueDateDirection === 'too_early') parts.push('Prazos sugeridos tendem a ser cedo demais');
  if (behavior.dueDateDirection === 'too_late') parts.push('Prazos sugeridos tendem a ser tarde demais');
  if (behavior.calendarDurationDirection === 'too_short') parts.push('Eventos tendem a ser curtos demais');
  if (behavior.calendarDurationDirection === 'too_long') parts.push('Eventos tendem a ser longos demais');
  if (behavior.shouldBeUrgent) parts.push('Deveria tratar como urgente');
  if (behavior.shouldBeLowerPriority) parts.push('Deveria baixar prioridade');
  if (behavior.askForMoreContext) parts.push('Pedir mais contexto');
  if (behavior.reviewReasoning) parts.push('Rever melhor a razao');
  if (behavior.reviewPriority) parts.push('Rever prioridade');
  if (behavior.reviewDeadline) parts.push('Rever prazo');
  if (behavior.unnecessaryEvent) parts.push('Evitar eventos desnecessarios');
  return parts.length ? parts : ['Regra geral de preferencia'];
}

function formatContext(rule: AdvisorMemoryRule) {
  const context = ruleContext(rule);
  const parts = [];
  if (context.commandTypes?.length) parts.push(`comando: ${context.commandTypes.join(', ')}`);
  if (context.changedFields?.length) parts.push(`campos: ${context.changedFields.join(', ')}`);
  if (context.requiredTags?.length) parts.push(`tags: ${context.requiredTags.map((tag) => `#${tag}`).join(', ')}`);
  if (context.statuses?.length) parts.push(`estado: ${context.statuses.join(', ')}`);
  if (context.hasDueDate === true) parts.push('com prazo');
  if (context.hasDueDate === false) parts.push('sem prazo');
  if (context.isOverdue === true) parts.push('em atraso');
  if (context.isBlocked === true) parts.push('bloqueada');
  if (context.titleKeywords?.length) parts.push(`topico: ${context.titleKeywords.join(', ')}`);
  return parts.length ? parts : ['contexto geral da acao'];
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
}

function StatusChecks({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  return (
    <div className="advisor-memory-checks">
      {STATUS_OPTIONS.map((status) => (
        <label key={status}><input type="checkbox" checked={value.includes(status)} onChange={(event) => onChange(event.target.checked ? [...value, status] : value.filter((item) => item !== status))} /><span>{status}</span></label>
      ))}
    </div>
  );
}

function LearnedRuleCard({ rule, onForget, onUpdate }: { rule: AdvisorMemoryRule; onForget: (id: string) => void; onUpdate: LearnedRulesViewProps['onUpdate'] }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(() => draftFromRule(rule));
  useEffect(() => { setDraft(draftFromRule(rule)); setEditing(false); }, [rule.id]);

  async function save() {
    setSaving(true);
    try {
      await onUpdate(rule.id, buildPatch(draft));
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="learned-rule-card">
      <div className="learned-rule-main">
        <div className="learned-rule-meta"><span>{ruleTypeLabel(rule.ruleType)}</span><span>{actionLabel(rule.action)}</span><span>{rule.supportCount} feedback</span></div>
        {editing ? (
          <div className="advisor-memory-editor">
            <label><span>Resumo</span><input value={draft.summary} maxLength={300} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} /></label>
            <fieldset><legend>Contexto</legend>
              <div className="advisor-memory-grid">
                <label><span>Topicos/titulo</span><input value={draft.context.titleKeywords} onChange={(event) => setDraft({ ...draft, context: { ...draft.context, titleKeywords: event.target.value } })} /></label>
                <label><span>Comandos</span><input value={draft.context.commandTypes} onChange={(event) => setDraft({ ...draft, context: { ...draft.context, commandTypes: event.target.value } })} /></label>
                <label><span>Campos alterados</span><input value={draft.context.changedFields} onChange={(event) => setDraft({ ...draft, context: { ...draft.context, changedFields: event.target.value } })} /></label>
                <label><span>Tags requeridas</span><input value={draft.context.requiredTags} onChange={(event) => setDraft({ ...draft, context: { ...draft.context, requiredTags: event.target.value } })} /></label>
              </div>
              <span className="advisor-memory-label">Estados</span><StatusChecks value={draft.context.statuses} onChange={(statuses) => setDraft({ ...draft, context: { ...draft.context, statuses } })} />
              <div className="advisor-memory-grid three">
                <label><span>Prazo</span><select value={draft.context.hasDueDate} onChange={(event) => setDraft({ ...draft, context: { ...draft.context, hasDueDate: event.target.value as MemoryDraft['context']['hasDueDate'] } })}><option value="">Qualquer</option><option value="true">Com prazo</option><option value="false">Sem prazo</option></select></label>
                <label><span>Atraso</span><select value={draft.context.isOverdue} onChange={(event) => setDraft({ ...draft, context: { ...draft.context, isOverdue: event.target.value as MemoryDraft['context']['isOverdue'] } })}><option value="">Qualquer</option><option value="true">Em atraso</option><option value="false">Nao atrasada</option></select></label>
                <label><span>Bloqueio</span><select value={draft.context.isBlocked} onChange={(event) => setDraft({ ...draft, context: { ...draft.context, isBlocked: event.target.value as MemoryDraft['context']['isBlocked'] } })}><option value="">Qualquer</option><option value="true">Bloqueada</option><option value="false">Nao bloqueada</option></select></label>
              </div>
            </fieldset>
            <fieldset><legend>Comportamento</legend>
              <div className="advisor-memory-grid">
                <label><span>Evitar tags</span><input value={draft.behavior.avoidTags} onChange={(event) => setDraft({ ...draft, behavior: { ...draft.behavior, avoidTags: event.target.value } })} /></label>
                <label><span>Preferir tags</span><input value={draft.behavior.preferTags} onChange={(event) => setDraft({ ...draft, behavior: { ...draft.behavior, preferTags: event.target.value } })} /></label>
                <label><span>Volume tags</span><select value={draft.behavior.tagVolume} onChange={(event) => setDraft({ ...draft, behavior: { ...draft.behavior, tagVolume: event.target.value as MemoryDraft['behavior']['tagVolume'] } })}><option value="">Sem regra</option><option value="more">Mais</option><option value="less">Menos</option><option value="ok">Ok</option></select></label>
                <label><span>Prioridade</span><select value={draft.behavior.priorityDirection} onChange={(event) => setDraft({ ...draft, behavior: { ...draft.behavior, priorityDirection: event.target.value as MemoryDraft['behavior']['priorityDirection'] } })}><option value="">Sem regra</option><option value="too_high">Alta demais</option><option value="too_low">Baixa demais</option><option value="ok">Ok</option></select></label>
                <label><span>Antiguidade</span><select value={draft.behavior.taskAgeImportance} onChange={(event) => setDraft({ ...draft, behavior: { ...draft.behavior, taskAgeImportance: event.target.value as MemoryDraft['behavior']['taskAgeImportance'] } })}><option value="">Sem regra</option><option value="too_much">Peso demais</option><option value="too_little">Pouco peso</option><option value="ok">Ok</option></select></label>
                <label><span>Atraso</span><select value={draft.behavior.overdueImportance} onChange={(event) => setDraft({ ...draft, behavior: { ...draft.behavior, overdueImportance: event.target.value as MemoryDraft['behavior']['overdueImportance'] } })}><option value="">Sem regra</option><option value="too_much">Peso demais</option><option value="too_little">Pouco peso</option><option value="ok">Ok</option></select></label>
                <label><span>Prazo</span><select value={draft.behavior.dueDateDirection} onChange={(event) => setDraft({ ...draft, behavior: { ...draft.behavior, dueDateDirection: event.target.value as MemoryDraft['behavior']['dueDateDirection'] } })}><option value="">Sem regra</option><option value="too_early">Cedo demais</option><option value="too_late">Tarde demais</option><option value="ok">Ok</option></select></label>
                <label><span>Duracao calendario</span><select value={draft.behavior.calendarDurationDirection} onChange={(event) => setDraft({ ...draft, behavior: { ...draft.behavior, calendarDurationDirection: event.target.value as MemoryDraft['behavior']['calendarDurationDirection'] } })}><option value="">Sem regra</option><option value="too_short">Curta demais</option><option value="too_long">Longa demais</option><option value="ok">Ok</option></select></label>
              </div>
              <div className="advisor-memory-checks">{(['avoidSimilarSuggestions', 'askForMoreContext', 'reviewReasoning', 'reviewPriority', 'reviewDeadline', 'unnecessaryEvent', 'wrongCalendar', 'shouldBeUrgent', 'shouldBeLowerPriority'] as const).map((key) => <label key={key}><input type="checkbox" checked={draft.behavior[key]} onChange={(event) => setDraft({ ...draft, behavior: { ...draft.behavior, [key]: event.target.checked } })} /><span>{key}</span></label>)}</div>
            </fieldset>
            <div className="advisor-memory-editor-actions"><button type="button" className="button primary small" disabled={saving} onClick={save}>{saving ? 'A guardar...' : 'Guardar'}</button><button type="button" className="button ghost small" onClick={() => { setDraft(draftFromRule(rule)); setEditing(false); }}>Cancelar</button></div>
          </div>
        ) : (
          <>
            <h3>{ruleTitle(rule)}</h3>
            <small>Aplica quando: {formatContext(rule).join(' · ')}</small>
            <ul>{formatRule(rule).map((item) => <li key={item}>{item}</li>)}</ul>
            <small>{rule.rule.source === 'openai_feedback_interpretation' ? 'Interpretada por OpenAI' : rule.rule.source === 'manual_memory_edit' ? 'Editada manualmente' : 'Fallback backend'}{typeof rule.rule.confidence === 'number' ? ` · confianca ${Math.round(rule.rule.confidence * 100)}%` : ''}{' · '}Ultimo feedback: {formatDate(rule.lastFeedbackAt)}</small>
          </>
        )}
      </div>
      <div className="learned-rule-actions"><button type="button" className="button secondary small" onClick={() => setEditing((current) => !current)}>{editing ? 'Fechar' : 'Editar'}</button><button type="button" className="button ghost small" onClick={() => onForget(rule.id)}>Esquecer</button></div>
    </article>
  );
}

export default function LearnedRulesView({ rules, loading, onRefresh, onForget, onUpdate }: LearnedRulesViewProps) {
  useEffect(() => { onRefresh(); }, []);

  return (
    <section className="learned-rules-view" aria-label="Feedback AI">
      <header className="learned-rules-header"><div><span>Feedback AI</span><h2>Memoria de feedback</h2><p>{rules.length} regras de feedback a orientar futuras sugestoes do Advisor.</p></div><button type="button" className="button secondary small" onClick={onRefresh} disabled={loading}>{loading ? 'A carregar...' : 'Atualizar'}</button></header>
      {rules.length ? <div className="learned-rules-list">{rules.map((rule) => <LearnedRuleCard key={rule.id} rule={rule} onForget={onForget} onUpdate={onUpdate} />)}</div> : <p className="empty-column">{loading ? 'A carregar regras...' : 'Ainda nao existem regras aprendidas.'}</p>}
    </section>
  );
}