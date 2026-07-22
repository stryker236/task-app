import { useEffect, useState } from 'react';
import {
  createSchedulerRule,
  deleteSchedulerRule,
  getSchedulerRules,
  reinterpretSchedulerRule,
  updateSchedulerRule,
  type SchedulerRule
} from '../../features/scheduler/api';

function formatConstraint(rule: SchedulerRule['constraints'][number]) {
  const payload = Object.entries(rule.payload || {}).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`);
  return `${rule.type}${rule.hard ? '' : ' (preferencia)'}${payload.length ? ` - ${payload.join('; ')}` : ''}`;
}

export default function SchedulerRulesPanel() {
  const [rules, setRules] = useState<SchedulerRule[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    try {
      setLoading(true);
      setError('');
      setRules(await getSchedulerRules());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function createRule() {
    if (!text.trim()) return;
    try {
      setSaving(true);
      setError('');
      const rule = await createSchedulerRule(text.trim());
      setRules((current) => [rule, ...current]);
      setText('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function updateRule(rule: SchedulerRule, enabled: boolean) {
    try {
      setError('');
      const updated = await updateSchedulerRule(rule.id, { enabled });
      setRules((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    }
  }

  async function reinterpret(rule: SchedulerRule) {
    try {
      setError('');
      const updated = await reinterpretSchedulerRule(rule.id);
      setRules((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    }
  }

  async function removeRule(rule: SchedulerRule) {
    try {
      setError('');
      await deleteSchedulerRule(rule.id);
      setRules((current) => current.filter((item) => item.id !== rule.id));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <details className="advisor-memory">
      <summary>Regras de agendamento</summary>
      <div className="advisor-memory-actions">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Ex: Nao marcar tarefas de codigo depois das 18:00"
          rows={3}
        />
        <div className="advisor-buffer-actions">
          <button type="button" className="button primary small" onClick={createRule} disabled={saving || !text.trim()}>
            {saving ? 'A interpretar...' : 'Adicionar regra'}
          </button>
          <button type="button" className="button secondary small" onClick={refresh} disabled={loading}>
            {loading ? 'A carregar...' : 'Atualizar'}
          </button>
        </div>
      </div>
      {error && <p className="advisor-empty">{error}</p>}
      {rules.length ? (
        <div className="advisor-memory-list">
          {rules.map((rule) => (
            <article key={rule.id}>
              <div>
                <strong>{rule.text}</strong>
                <p>{rule.interpretation || 'Sem interpretacao ainda.'}</p>
                <small>{rule.status} - {rule.enabled ? 'ativa' : 'desativada'}{rule.confidence != null ? ` - ${Math.round(rule.confidence * 100)}%` : ''}</small>
                {rule.constraints.length ? (
                  <ul>
                    {rule.constraints.map((constraint) => <li key={constraint.id}>{formatConstraint(constraint)}</li>)}
                  </ul>
                ) : null}
              </div>
              <div className="advisor-buffer-actions">
                <button type="button" className="button ghost small" onClick={() => updateRule(rule, !rule.enabled)}>
                  {rule.enabled ? 'Desativar' : 'Ativar'}
                </button>
                <button type="button" className="button ghost small" onClick={() => reinterpret(rule)}>
                  Reinterpretar
                </button>
                <button type="button" className="button ghost small" onClick={() => removeRule(rule)}>
                  Apagar
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="advisor-empty">{loading ? 'A carregar regras...' : 'Sem regras de agendamento.'}</p>
      )}
    </details>
  );
}
