import type { AdvisorMemoryRule } from '../../api';

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
  return parts.length ? parts.join(' Â· ') : 'Regra geral de sugestao';
}

export default function AdvisorMemoryPanel({
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
                <small>{rule.action || 'todas'} Â· {rule.ruleType} Â· {rule.supportCount} feedback</small>
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
