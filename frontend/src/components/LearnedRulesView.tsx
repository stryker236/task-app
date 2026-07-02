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
    create_followups: 'Criar follow-ups',
    organize_blockers: 'Organizar bloqueios'
  };
  return labels[action] || action || 'Todas';
}

function ruleTypeLabel(type: string) {
  const labels: Record<string, string> = {
    tag_suggestion: 'Tags',
    advisor_suggestion: 'Sugestao'
  };
  return labels[type] || type;
}

function formatRule(rule: AdvisorMemoryRule) {
  const parts = [];
  if (rule.rule.avoidTags?.length) parts.push(`Evitar ${rule.rule.avoidTags.map((tag) => `#${tag}`).join(', ')}`);
  if (rule.rule.preferTags?.length) parts.push(`Preferir ${rule.rule.preferTags.map((tag) => `#${tag}`).join(', ')}`);
  if (rule.rule.tagVolume === 'less') parts.push('Sugerir menos tags');
  if (rule.rule.tagVolume === 'more') parts.push('Sugerir mais tags');
  if (rule.rule.avoidSimilarSuggestions) parts.push('Evitar sugestoes parecidas');
  if (rule.rule.askForMoreContext) parts.push('Pedir mais contexto');
  if (rule.rule.reviewReasoning) parts.push('Rever melhor a razao');
  if (rule.rule.reviewPriority) parts.push('Rever prioridade');
  if (rule.rule.reviewDeadline) parts.push('Rever prazo');
  return parts.length ? parts : ['Regra geral de preferencia'];
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
    <section className="learned-rules-view" aria-label="Regras aprendidas">
      <header className="learned-rules-header">
        <div>
          <span>Memoria da app</span>
          <h2>Regras aprendidas</h2>
          <p>{rules.length} regras ativas a influenciar futuras sugestoes.</p>
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
                <h3>{rule.titleFingerprint || 'Regra global'}</h3>
                <ul>
                  {formatRule(rule).map((item) => <li key={item}>{item}</li>)}
                </ul>
                <small>Ultimo feedback: {formatDate(rule.lastFeedbackAt)}</small>
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
