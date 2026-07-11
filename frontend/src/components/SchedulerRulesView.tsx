import { useEffect, useMemo, useState } from 'react';
import {
  createSchedulerRulesFromText,
  deleteSchedulerRule,
  getSchedulerRules,
  reinterpretSchedulerRule,
  updateSchedulerRule,
  type SchedulerRule,
  type SchedulerRuleConstraint
} from '../api';

function formatPayload(payload: Record<string, unknown>) {
  const entries = Object.entries(payload || {});
  if (!entries.length) return 'Sem parametros';
  return entries.map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`).join('; ');
}

function formatScope(scope: Record<string, unknown>) {
  const entries = Object.entries(scope || {});
  if (!entries.length) return 'Todas as tarefas elegiveis';
  return entries.map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`).join('; ');
}

function constraintLabel(constraint: SchedulerRuleConstraint) {
  const strength = constraint.hard ? 'Obrigatoria' : 'Preferencia';
  return `${constraint.type} - ${strength}`;
}

function ConstraintDetails({
  constraint,
  copied,
  onCopy
}: {
  constraint: SchedulerRuleConstraint;
  copied: boolean;
  onCopy: (constraint: SchedulerRuleConstraint) => void;
}) {
  return (
    <article className="scheduler-constraint-card">
      <header>
        <strong>{constraintLabel(constraint)}</strong>
        <span>{constraint.enabled ? 'ativa' : 'desativada'}</span>
      </header>
      <dl>
        <div>
          <dt>Escopo</dt>
          <dd>{formatScope(constraint.scope)}</dd>
        </div>
        <div>
          <dt>Parametros</dt>
          <dd>{formatPayload(constraint.payload)}</dd>
        </div>
        <div>
          <dt>Constraint guardada</dt>
          <dd>
            <div className="scheduler-payload-box">
              <button type="button" className="button ghost small" onClick={() => onCopy(constraint)}>
                {copied ? 'Copiado' : 'Copiar'}
              </button>
              <pre>{JSON.stringify(constraint, null, 2)}</pre>
            </div>
          </dd>
        </div>
      </dl>
    </article>
  );
}

export default function SchedulerRulesView() {
  const [rules, setRules] = useState<SchedulerRule[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [lastCreatedCount, setLastCreatedCount] = useState(0);
  const [copiedConstraintId, setCopiedConstraintId] = useState('');

  const selectedRule = useMemo(
    () => rules.find((rule) => rule.id === selectedId) || rules[0] || null,
    [rules, selectedId]
  );

  async function refresh() {
    try {
      setLoading(true);
      setError('');
      const nextRules = await getSchedulerRules();
      setRules(nextRules);
      setSelectedId((current) => current && nextRules.some((rule) => rule.id === current) ? current : nextRules[0]?.id || '');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function submitRule() {
    if (!message.trim()) return;
    try {
      setSaving(true);
      setError('');
      const result = await createSchedulerRulesFromText(message.trim());
      setRules((current) => [...result.rules, ...current]);
      setSelectedId(result.rules[0]?.id || '');
      setLastCreatedCount(result.rules.length);
      setMessage('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function setRuleEnabled(rule: SchedulerRule, enabled: boolean) {
    try {
      setError('');
      const updated = await updateSchedulerRule(rule.id, { enabled });
      setRules((current) => current.map((item) => item.id === updated.id ? updated : item));
      setSelectedId(updated.id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    }
  }

  async function reinterpret(rule: SchedulerRule) {
    try {
      setError('');
      const updated = await reinterpretSchedulerRule(rule.id);
      setRules((current) => current.map((item) => item.id === updated.id ? updated : item));
      setSelectedId(updated.id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    }
  }

  async function removeRule(rule: SchedulerRule) {
    try {
      setError('');
      await deleteSchedulerRule(rule.id);
      setRules((current) => current.filter((item) => item.id !== rule.id));
      setSelectedId((current) => current === rule.id ? '' : current);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    }
  }

  async function copyConstraintPayload(constraint: SchedulerRuleConstraint) {
    const payload = JSON.stringify(constraint, null, 2);
    await navigator.clipboard.writeText(payload);
    setCopiedConstraintId(constraint.id);
    window.setTimeout(() => setCopiedConstraintId((current) => current === constraint.id ? '' : current), 1500);
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <section className="scheduler-rules-view" aria-label="Regras de agendamento AI">
      <header className="scheduler-rules-header">
        <div>
          <span>Agenda AI</span>
          <h2>Regras de agendamento</h2>
          <p>Escreve preferencias em texto. A app guarda o texto original, a interpretacao e as restricoes usadas pelo scheduler.</p>
        </div>
        <button type="button" className="button secondary small" onClick={refresh} disabled={loading}>
          {loading ? 'A carregar...' : 'Atualizar'}
        </button>
      </header>

      {error && <p className="advisor-empty">{error}</p>}

      {lastCreatedCount > 1 && (
        <p className="scheduler-split-notice">
          A mensagem foi dividida em {lastCreatedCount} regras concretas. Reve cada uma antes de confiar no agendamento.
        </p>
      )}

      <div className="scheduler-rules-layout">
        <section className="scheduler-rule-chat" aria-label="Criar regra">
          <div className="scheduler-chat-history">
            {rules.length ? rules.map((rule) => (
              <button
                key={rule.id}
                type="button"
                className={`scheduler-chat-message ${selectedRule?.id === rule.id ? 'is-selected' : ''}`}
                onClick={() => setSelectedId(rule.id)}
              >
                <strong>{rule.text}</strong>
                <span>{rule.interpretation || 'Sem interpretacao'}</span>
                <small>{rule.status} - {rule.enabled ? 'ativa' : 'desativada'} - {rule.constraints.length} restricoes</small>
              </button>
            )) : (
              <p className="advisor-empty">{loading ? 'A carregar regras...' : 'Ainda nao ha regras. Escreve uma preferencia para comecar.'}</p>
            )}
          </div>

          <div className="scheduler-chat-composer">
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Ex: Durante a manha prefiro tarefas com tag focus. Na sexta quero no maximo 2 tarefas admin."
              rows={4}
            />
            <button type="button" className="button primary" onClick={submitRule} disabled={saving || !message.trim()}>
              {saving ? 'A interpretar...' : 'Enviar regra'}
            </button>
          </div>
        </section>

        <aside className="scheduler-rule-details" aria-label="Detalhes da regra">
          {selectedRule ? (
            <>
              <header>
                <div>
                  <span>Detalhes</span>
                  <h3>{selectedRule.text}</h3>
                </div>
                <span className={`scheduler-rule-status is-${selectedRule.status}`}>{selectedRule.status}</span>
              </header>

              <dl className="scheduler-rule-summary">
                <div>
                  <dt>Interpretacao OpenAI</dt>
                  <dd>{selectedRule.interpretation || 'Sem interpretacao.'}</dd>
                </div>
                <div>
                  <dt>Estado</dt>
                  <dd>{selectedRule.enabled ? 'Ativa no scheduler' : 'Nao usada no scheduler'}</dd>
                </div>
                <div>
                  <dt>Confianca</dt>
                  <dd>{selectedRule.confidence != null ? `${Math.round(selectedRule.confidence * 100)}%` : 'Nao indicada'}</dd>
                </div>
                <div>
                  <dt>Modelo</dt>
                  <dd>{selectedRule.model || 'Nao indicado'}</dd>
                </div>
              </dl>

              <div className="scheduler-rule-actions">
                <button type="button" className="button secondary small" onClick={() => setRuleEnabled(selectedRule, !selectedRule.enabled)}>
                  {selectedRule.enabled ? 'Desativar' : 'Ativar'}
                </button>
                <button type="button" className="button secondary small" onClick={() => reinterpret(selectedRule)}>
                  Reinterpretar
                </button>
                <button type="button" className="button ghost small" onClick={() => removeRule(selectedRule)}>
                  Apagar
                </button>
              </div>

              <section className="scheduler-constraints-section">
                <h4>Restricoes derivadas</h4>
                {selectedRule.constraints.length ? (
                  <div className="scheduler-constraints-list">
                    {selectedRule.constraints.map((constraint) => (
                      <ConstraintDetails
                        key={constraint.id}
                        constraint={constraint}
                        copied={copiedConstraintId === constraint.id}
                        onCopy={copyConstraintPayload}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="advisor-empty">Sem restricoes derivadas. A regra pode precisar de revisao.</p>
                )}
              </section>
            </>
          ) : (
            <p className="advisor-empty">Seleciona ou cria uma regra para ver os detalhes.</p>
          )}
        </aside>
      </div>
    </section>
  );
}
