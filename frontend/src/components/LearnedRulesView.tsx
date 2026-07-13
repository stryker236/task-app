import { useEffect } from 'react';
import type { AdvisorMemoryRule } from '../api';

type LearnedRulesViewProps = {
  rules: AdvisorMemoryRule[];
  loading: boolean;
  onRefresh: () => void;
  onForget: (id: string) => void;
};

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    improve_tasks: 'Melhorar tasks',
    suggest_tags: 'Sugerir tags',
    suggest_due_dates: 'Sugerir due dates',
    priority_management: 'Gestao de prioridades',
    create_followups: 'Criar follow-ups',
    organize_blockers: 'Organizar bloqueios'
  };
  return labels[action] || action || 'Todas';
}

function ruleTypeLabel(type: string) {
  const labels: Record<string, string> = {
    tag_suggestion: 'Tags',
    priority_suggestion: 'Prioridade',
    due_date_suggestion: 'Prazos',
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
  if (behavior.shouldBeUrgent) parts.push('Deveria tratar como urgente');
  if (behavior.shouldBeLowerPriority) parts.push('Deveria baixar prioridade');
  if (behavior.askForMoreContext) parts.push('Pedir mais contexto');
  if (behavior.reviewReasoning) parts.push('Rever melhor a razao');
  if (behavior.reviewPriority) parts.push('Rever prioridade');
  if (behavior.reviewDeadline) parts.push('Rever prazo');
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
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

export default function LearnedRulesView({ rules, loading, onRefresh, onForget }: LearnedRulesViewProps) {
  useEffect(() => {
    onRefresh();
  }, []);

  return (
    <section className="learned-rules-view" aria-label="Feedback AI">
      <header className="learned-rules-header">
        <div>
          <span>Feedback AI</span>
          <h2>Memoria de feedback</h2>
          <p>{rules.length} regras de feedback a orientar futuras sugestoes do Advisor.</p>
        </div>
        <button type="button" className="button secondary small" onClick={onRefresh} disabled={loading}>
          {loading ? 'A carregar...' : 'Atualizar'}
        </button>
      </header>

      {rules.length ? (
        <div className="learned-rules-list">
          {rules.map((rule) => (
            <article className="learned-rule-card" key={rule.id}>
              <div className="learned-rule-main">
                <div className="learned-rule-meta">
                  <span>{ruleTypeLabel(rule.ruleType)}</span>
                  <span>{actionLabel(rule.action)}</span>
                  <span>{rule.supportCount} feedback</span>
                </div>
                <h3>{ruleTitle(rule)}</h3>
                <small>Aplica quando: {formatContext(rule).join(' · ')}</small>
                <ul>
                  {formatRule(rule).map((item) => <li key={item}>{item}</li>)}
                </ul>
                <small>
                  {rule.rule.source === 'openai_feedback_interpretation' ? 'Interpretada por OpenAI' : 'Fallback backend'}
                  {typeof rule.rule.confidence === 'number' ? ` · confianca ${Math.round(rule.rule.confidence * 100)}%` : ''}
                  {' · '}Ultimo feedback: {formatDate(rule.lastFeedbackAt)}
                </small>
              </div>
              <button type="button" className="button ghost small" onClick={() => onForget(rule.id)}>
                Esquecer
              </button>
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-column">{loading ? 'A carregar regras...' : 'Ainda nao existem regras aprendidas.'}</p>
      )}
    </section>
  );
}
