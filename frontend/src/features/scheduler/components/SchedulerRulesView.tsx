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
import { getTasks } from '../../tasks/api';
import type { Task } from '../../../../../shared/types';

import {
  ConstraintDetails
} from './SchedulerRuleEditorParts';
import {
  buildConstraint,
  draftFromConstraint,
  formatPayload,
  formatScope,
  ruleAppliesToTask,
  validateDraft,
  type ConstraintDraft
} from '../schedulerRuleUtils';
export default function SchedulerRulesView() {
  const [rules, setRules] = useState<SchedulerRule[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingConstraintId, setSavingConstraintId] = useState('');
  const [error, setError] = useState('');
  const [lastCreatedCount, setLastCreatedCount] = useState(0);
  const [copiedConstraintId, setCopiedConstraintId] = useState('');
  const [copiedTaskId, setCopiedTaskId] = useState('');
  const [ruleTitleDraft, setRuleTitleDraft] = useState('');
  const [savingRuleTitle, setSavingRuleTitle] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState('');
  const [refreshFailed, setRefreshFailed] = useState(false);

  const selectedRule = useMemo(() => rules.find((rule) => rule.id === selectedId) || rules[0] || null, [rules, selectedId]);
  const affectedTasks = useMemo(() => selectedRule ? tasks.filter((task) => ruleAppliesToTask(selectedRule, task)) : [], [selectedRule, tasks]);

  async function refresh(options: { preferredSelectedId?: string; silent?: boolean } = {}) {
    try {
      setLoading(true);
      setError('');
      setRefreshFailed(false);
      if (!options.silent) setRefreshNotice('');
      const [nextRules, nextTasks] = await Promise.all([getSchedulerRules(), getTasks({ includeArchived: true })]);
      setRules(nextRules);
      setTasks(nextTasks);
      setSelectedId((current) => {
        if (options.preferredSelectedId && nextRules.some((rule) => rule.id === options.preferredSelectedId)) return options.preferredSelectedId;
        return current && nextRules.some((rule) => rule.id === current) ? current : nextRules[0]?.id || '';
      });
      setRefreshNotice(`Impacto atualizado: ${nextRules.length} regras e ${nextTasks.length} tasks carregadas.`);
      return true;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
      setRefreshFailed(true);
      setRefreshNotice('Nao consegui atualizar o impacto das regras. Podes tentar novamente.');
      return false;
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
      await refresh({ preferredSelectedId: result.rules[0]?.id || '', silent: true });
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
      await refresh({ preferredSelectedId: updated.id, silent: true });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    }
  }

  async function saveConstraint(rule: SchedulerRule, constraint: SchedulerRuleConstraint, draft: ConstraintDraft) {
    const errors = validateDraft(draft);
    if (errors.length) {
      setError(errors.join(' '));
      return;
    }
    try {
      setError('');
      setSavingConstraintId(constraint.id);
      const constraints = rule.constraints.map((item) => item.id === constraint.id ? buildConstraint(draft) : buildConstraint(draftFromConstraint(item)));
      const updated = await updateSchedulerRule(rule.id, { constraints });
      setRules((current) => current.map((item) => item.id === updated.id ? updated : item));
      setSelectedId(updated.id);
      await refresh({ preferredSelectedId: updated.id, silent: true });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setSavingConstraintId('');
    }
  }

  async function saveRuleTitle(rule: SchedulerRule) {
    const text = ruleTitleDraft.trim();
    if (!text) {
      setError('O titulo da regra nao pode ficar vazio.');
      return;
    }
    try {
      setError('');
      setSavingRuleTitle(true);
      const updated = await updateSchedulerRule(rule.id, { text });
      setRules((current) => current.map((item) => item.id === updated.id ? updated : item));
      setSelectedId(updated.id);
      await refresh({ preferredSelectedId: updated.id, silent: true });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setSavingRuleTitle(false);
    }
  }

  async function copyTaskId(task: Task) {
    await navigator.clipboard.writeText(task.id);
    setCopiedTaskId(task.id);
    window.setTimeout(() => setCopiedTaskId((current) => current === task.id ? '' : current), 1500);
  }
  async function reinterpret(rule: SchedulerRule) {
    try {
      setError('');
      const updated = await reinterpretSchedulerRule(rule.id);
      setRules((current) => current.map((item) => item.id === updated.id ? updated : item));
      setSelectedId(updated.id);
      await refresh({ preferredSelectedId: updated.id, silent: true });
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
      await refresh({ silent: true });
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

  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    setRuleTitleDraft(selectedRule?.text || '');
  }, [selectedRule?.id, selectedRule?.text]);

  return (
    <section className="scheduler-rules-view" aria-label="Regras de agendamento AI">
      <header className="scheduler-rules-header">
        <div>
          <span>Agenda AI</span>
          <h2>Regras de agendamento</h2>
          <p>Escreve preferencias em texto ou corrige restricoes com campos seguros. A app valida o formato antes de guardar.</p>
        </div>
        <button type="button" className="button secondary small" onClick={() => { void refresh(); }} disabled={loading}>{loading ? 'A carregar...' : 'Atualizar'}</button>
      </header>

      {error && <p className="advisor-empty">{error}</p>}
      {refreshNotice && (
        <p className={`scheduler-refresh-notice ${refreshFailed ? 'is-error' : ''}`}>
          {refreshNotice}
          {refreshFailed && <button type="button" className="button secondary small" onClick={() => { void refresh(); }} disabled={loading}>{loading ? 'A atualizar...' : 'Atualizar agora'}</button>}
        </p>
      )}
      {lastCreatedCount > 1 && <p className="scheduler-split-notice">A mensagem foi dividida em {lastCreatedCount} regras concretas. Reve cada uma antes de confiar no agendamento.</p>}

      <div className="scheduler-rules-layout">
        <section className="scheduler-rule-chat" aria-label="Criar regra">
          <div className="scheduler-chat-history">
            {rules.length ? rules.map((rule) => (
              <button key={rule.id} type="button" className={`scheduler-chat-message ${selectedRule?.id === rule.id ? 'is-selected' : ''}`} onClick={() => setSelectedId(rule.id)}>
                <strong>{rule.text}</strong>
                <span>{rule.interpretation || 'Sem interpretacao'}</span>
                <small>{rule.status} - {rule.enabled ? 'ativa' : 'desativada'} - {rule.constraints.length} restricoes</small>
              </button>
            )) : <p className="advisor-empty">{loading ? 'A carregar regras...' : 'Ainda nao ha regras. Escreve uma preferencia para comecar.'}</p>}
          </div>

          <div className="scheduler-chat-composer">
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ex: Durante a manha prefiro tarefas com tag focus. Na sexta quero no maximo 2 tarefas admin." rows={4} />
            <button type="button" className="button primary" onClick={submitRule} disabled={saving || !message.trim()}>{saving ? 'A interpretar...' : 'Enviar regra'}</button>
          </div>
        </section>

        <aside className="scheduler-rule-details" aria-label="Detalhes da regra">
          {selectedRule ? (
            <>
              <header>
                <div className="scheduler-rule-title-editor">
                  <span>Detalhes</span>
                  <label>
                    <span>Titulo da regra</span>
                    <input value={ruleTitleDraft} maxLength={1000} onChange={(event) => setRuleTitleDraft(event.target.value)} />
                  </label>
                  <button type="button" className="button secondary small" disabled={savingRuleTitle || !ruleTitleDraft.trim() || ruleTitleDraft.trim() === selectedRule.text} onClick={() => saveRuleTitle(selectedRule)}>
                    {savingRuleTitle ? 'A guardar...' : 'Guardar titulo'}
                  </button>
                </div>
                <span className={`scheduler-rule-status is-${selectedRule.status}`}>{selectedRule.status}</span>
              </header>

              <dl className="scheduler-rule-summary">
                <div><dt>Interpretacao</dt><dd>{selectedRule.interpretation || 'Sem interpretacao.'}</dd></div>
                <div><dt>Estado</dt><dd>{selectedRule.enabled ? 'Ativa no scheduler' : 'Nao usada no scheduler'}</dd></div>
                <div><dt>Confianca</dt><dd>{selectedRule.confidence != null ? `${Math.round(selectedRule.confidence * 100)}%` : 'Manual ou nao indicada'}</dd></div>
                <div><dt>Modelo</dt><dd>{selectedRule.model || 'Nao indicado'}</dd></div>
                <div><dt>Tasks afetadas</dt><dd>{affectedTasks.length}</dd></div>
              </dl>

              <div className="scheduler-rule-actions">
                <button type="button" className="button secondary small" onClick={() => setRuleEnabled(selectedRule, !selectedRule.enabled)}>{selectedRule.enabled ? 'Desativar' : 'Ativar'}</button>
                <button type="button" className="button secondary small" onClick={() => reinterpret(selectedRule)}>Reinterpretar</button>
                <button type="button" className="button secondary small" onClick={() => refresh({ preferredSelectedId: selectedRule.id })} disabled={loading}>{loading ? 'A atualizar...' : 'Atualizar impacto'}</button>
                <button type="button" className="button ghost small" onClick={() => removeRule(selectedRule)}>Apagar</button>
              </div>

              {affectedTasks.length > 0 && (
                <section className="scheduler-constraints-section">
                  <h4>Tasks afetadas</h4>
                  <div className="scheduler-affected-task-list">
                    {affectedTasks.slice(0, 12).map((task) => (
                      <article key={task.id}>
                        <strong>{task.title}</strong>
                        <small>{task.status} - P{task.priority}{task.tags.length ? ` - #${task.tags.join(' #')}` : ''}</small>
                      </article>
                    ))}
                    {affectedTasks.length > 12 && <p className="advisor-empty">+{affectedTasks.length - 12} tasks adicionais.</p>}
                  </div>
                </section>
              )}

              <section className="scheduler-constraints-section">
                <h4>Restricoes derivadas</h4>
                {selectedRule.constraints.length ? (
                  <div className="scheduler-constraints-list">
                    {selectedRule.constraints.map((constraint) => (
                      <ConstraintDetails key={constraint.id} constraint={constraint} copied={copiedConstraintId === constraint.id} saving={savingConstraintId === constraint.id} tasks={tasks} copiedTaskId={copiedTaskId} onCopy={copyConstraintPayload} onCopyTaskId={copyTaskId} onSave={(item, draft) => saveConstraint(selectedRule, item, draft)} />
                    ))}
                  </div>
                ) : <p className="advisor-empty">Sem restricoes derivadas. A regra pode precisar de revisao.</p>}
              </section>
            </>
          ) : <p className="advisor-empty">Seleciona ou cria uma regra para ver os detalhes.</p>}
        </aside>
      </div>
    </section>
  );
}


