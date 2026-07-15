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

type ConstraintDraft = {
  type: string;
  enabled: boolean;
  hard: boolean;
  scope: {
    allTasks: boolean;
    tags: string;
    titleIncludes: string;
    taskIds: string;
    statuses: string[];
    priorities: number[];
  };
  payload: Record<string, string | number | number[]>;
};

const STATUS_OPTIONS = ['new', 'in_progress', 'waiting', 'done', 'cancelled'];
const PRIORITY_OPTIONS = [1, 2, 3, 4];
const WEEKDAYS = [
  [1, 'Seg'],
  [2, 'Ter'],
  [3, 'Qua'],
  [4, 'Qui'],
  [5, 'Sex'],
  [6, 'Sab'],
  [7, 'Dom']
] as const;

const CONSTRAINT_OPTIONS = [
  ['blocked_window', 'Bloquear janela'],
  ['allowed_window', 'Permitir janela'],
  ['preferred_window', 'Preferir janela'],
  ['avoid_day', 'Evitar dias'],
  ['min_duration', 'Duracao minima'],
  ['max_duration', 'Duracao maxima'],
  ['priority_boost', 'Prioridade extra'],
  ['daily_limit', 'Limite diario'],
  ['break_after_task', 'Pausa apos tarefa'],
  ['break_after_work_block', 'Pausa apos bloco'],
  ['allowed_date', 'Data exata']
] as const;

function formatPayload(payload: Record<string, unknown>) {
  const entries = Object.entries(payload || {});
  if (!entries.length) return 'Sem parametros';
  return entries.map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`).join('; ');
}

function formatScope(scope: Record<string, unknown>) {
  const entries = Object.entries(scope || {}).filter(([, value]) => !(Array.isArray(value) && value.length === 0));
  if (!entries.length) return 'Todas as tarefas elegiveis';
  return entries.map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`).join('; ');
}

function constraintLabel(constraint: Pick<SchedulerRuleConstraint, 'type' | 'hard'>) {
  const label = CONSTRAINT_OPTIONS.find(([type]) => type === constraint.type)?.[1] || constraint.type;
  const strength = constraint.hard ? 'Obrigatoria' : 'Preferencia';
  return `${label} - ${strength}`;
}

function textList(value: unknown) {
  return Array.isArray(value) ? value.join(', ') : '';
}

function numericList(value: unknown) {
  return Array.isArray(value) ? value.map(Number).filter(Number.isFinite) : [];
}

function draftFromConstraint(constraint: SchedulerRuleConstraint): ConstraintDraft {
  return {
    type: constraint.type,
    enabled: constraint.enabled,
    hard: constraint.hard,
    scope: {
      allTasks: constraint.scope?.allTasks === true || !Object.keys(constraint.scope || {}).length,
      tags: textList(constraint.scope?.tags),
      titleIncludes: textList(constraint.scope?.titleIncludes),
      taskIds: textList(constraint.scope?.taskIds),
      statuses: Array.isArray(constraint.scope?.statuses) ? constraint.scope.statuses.map(String) : [],
      priorities: numericList(constraint.scope?.priorities)
    },
    payload: { ...(constraint.payload || {}) } as ConstraintDraft['payload']
  };
}

function splitList(value: string) {
  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function selectedNumbers(current: number[], value: number, checked: boolean) {
  const set = new Set(current);
  if (checked) set.add(value);
  else set.delete(value);
  return [...set].sort((left, right) => left - right);
}

function selectedStrings(current: string[], value: string, checked: boolean) {
  const set = new Set(current);
  if (checked) set.add(value);
  else set.delete(value);
  return [...set];
}

function validateTimeRange(payload: Record<string, unknown>, errors: string[]) {
  const startTime = String(payload.startTime || '');
  const endTime = String(payload.endTime || '');
  if (!startTime || !endTime) errors.push('Preenche inicio e fim.');
  if (startTime && endTime && endTime <= startTime) errors.push('A hora final tem de ser depois da inicial.');
}

function validateDraft(draft: ConstraintDraft) {
  const errors: string[] = [];
  const payload = draft.payload;
  if (['blocked_window', 'allowed_window', 'preferred_window'].includes(draft.type)) validateTimeRange(payload, errors);
  if (draft.type === 'avoid_day' && !numericList(payload.days).length) errors.push('Escolhe pelo menos um dia.');
  if (['min_duration', 'max_duration'].includes(draft.type) && numberValue(payload.minutes) <= 0) errors.push('Minutos tem de ser maior que zero.');
  if (draft.type === 'daily_limit' && numberValue(payload.max) <= 0) errors.push('Limite tem de ser maior que zero.');
  if (draft.type === 'break_after_task' && numberValue(payload.breakMinutes) <= 0) errors.push('Pausa tem de ser maior que zero.');
  if (draft.type === 'break_after_work_block') {
    if (numberValue(payload.workMinutes) <= 0) errors.push('Bloco de trabalho tem de ser maior que zero.');
    if (numberValue(payload.breakMinutes) <= 0) errors.push('Pausa tem de ser maior que zero.');
  }
  if (draft.type === 'allowed_date') {
    if (!String(payload.date || '')) errors.push('Escolhe uma data.');
    const hasStart = Boolean(payload.startTime);
    const hasEnd = Boolean(payload.endTime);
    if (hasStart || hasEnd) validateTimeRange(payload, errors);
  }
  if (draft.type === 'priority_boost') {
    const hasStart = Boolean(payload.startTime);
    const hasEnd = Boolean(payload.endTime);
    if (hasStart || hasEnd) validateTimeRange(payload, errors);
    if (payload.weight !== '' && payload.weight != null && (numberValue(payload.weight) < 1 || numberValue(payload.weight) > 10)) errors.push('Peso tem de estar entre 1 e 10.');
  }
  return errors;
}

function cleanPayload(draft: ConstraintDraft) {
  const payload = draft.payload;
  if (['blocked_window', 'allowed_window', 'preferred_window'].includes(draft.type)) {
    return { startTime: String(payload.startTime || ''), endTime: String(payload.endTime || '') };
  }
  if (draft.type === 'avoid_day') return { days: numericList(payload.days) };
  if (['min_duration', 'max_duration'].includes(draft.type)) return { minutes: numberValue(payload.minutes) };
  if (draft.type === 'daily_limit') {
    return { max: numberValue(payload.max), ...(numericList(payload.days).length ? { days: numericList(payload.days) } : {}) };
  }
  if (draft.type === 'break_after_task') {
    return {
      breakMinutes: numberValue(payload.breakMinutes),
      ...(numberValue(payload.minDurationMinutes) > 0 ? { minDurationMinutes: numberValue(payload.minDurationMinutes) } : {})
    };
  }
  if (draft.type === 'break_after_work_block') return { workMinutes: numberValue(payload.workMinutes), breakMinutes: numberValue(payload.breakMinutes) };
  if (draft.type === 'allowed_date') {
    return {
      date: String(payload.date || ''),
      ...(payload.startTime && payload.endTime ? { startTime: String(payload.startTime), endTime: String(payload.endTime) } : {})
    };
  }
  if (draft.type === 'priority_boost') {
    return {
      ...(numericList(payload.days).length ? { days: numericList(payload.days) } : {}),
      ...(payload.startTime && payload.endTime ? { startTime: String(payload.startTime), endTime: String(payload.endTime) } : {}),
      ...(numberValue(payload.weight) > 0 ? { weight: numberValue(payload.weight) } : {})
    };
  }
  return {};
}

function buildConstraint(draft: ConstraintDraft) {
  const scope: Record<string, unknown> = {};
  if (draft.scope.allTasks) scope.allTasks = true;
  const tags = splitList(draft.scope.tags);
  const titleIncludes = splitList(draft.scope.titleIncludes);
  const taskIds = splitList(draft.scope.taskIds);
  if (tags.length) delete scope.allTasks, scope.tags = tags;
  if (titleIncludes.length) delete scope.allTasks, scope.titleIncludes = titleIncludes;
  if (taskIds.length) delete scope.allTasks, scope.taskIds = taskIds;
  if (draft.scope.statuses.length) delete scope.allTasks, scope.statuses = draft.scope.statuses;
  if (draft.scope.priorities.length) delete scope.allTasks, scope.priorities = draft.scope.priorities;
  return {
    type: draft.type,
    scope,
    payload: cleanPayload(draft),
    hard: draft.hard,
    enabled: draft.enabled
  };
}

function WeekdayPicker({ value, onChange }: { value: number[]; onChange: (value: number[]) => void }) {
  return (
    <div className="scheduler-checkbox-row">
      {WEEKDAYS.map(([day, label]) => (
        <label key={day}>
          <input type="checkbox" checked={value.includes(day)} onChange={(event) => onChange(selectedNumbers(value, day, event.target.checked))} />
          <span>{label}</span>
        </label>
      ))}
    </div>
  );
}

function PayloadFields({ draft, onChange }: { draft: ConstraintDraft; onChange: (draft: ConstraintDraft) => void }) {
  const payload = draft.payload;
  const setPayload = (patch: Record<string, string | number | number[]>) => onChange({ ...draft, payload: { ...payload, ...patch } });
  if (['blocked_window', 'allowed_window', 'preferred_window'].includes(draft.type)) {
    return (
      <div className="scheduler-editor-grid two">
        <label><span>Inicio</span><input type="time" value={String(payload.startTime || '')} onChange={(event) => setPayload({ startTime: event.target.value })} /></label>
        <label><span>Fim</span><input type="time" value={String(payload.endTime || '')} onChange={(event) => setPayload({ endTime: event.target.value })} /></label>
      </div>
    );
  }
  if (draft.type === 'avoid_day') return <WeekdayPicker value={numericList(payload.days)} onChange={(days) => setPayload({ days })} />;
  if (['min_duration', 'max_duration'].includes(draft.type)) {
    return <label><span>Minutos</span><input type="number" min="1" max="1440" value={String(payload.minutes || '')} onChange={(event) => setPayload({ minutes: event.target.value })} /></label>;
  }
  if (draft.type === 'daily_limit') {
    return (
      <div className="scheduler-editor-stack">
        <label><span>Maximo por dia</span><input type="number" min="1" max="50" value={String(payload.max || '')} onChange={(event) => setPayload({ max: event.target.value })} /></label>
        <span className="scheduler-editor-label">Dias opcionais</span>
        <WeekdayPicker value={numericList(payload.days)} onChange={(days) => setPayload({ days })} />
      </div>
    );
  }
  if (draft.type === 'break_after_task') {
    return (
      <div className="scheduler-editor-grid two">
        <label><span>Pausa minutos</span><input type="number" min="1" max="240" value={String(payload.breakMinutes || '')} onChange={(event) => setPayload({ breakMinutes: event.target.value })} /></label>
        <label><span>Duracao minima opcional</span><input type="number" min="1" max="1440" value={String(payload.minDurationMinutes || '')} onChange={(event) => setPayload({ minDurationMinutes: event.target.value })} /></label>
      </div>
    );
  }
  if (draft.type === 'break_after_work_block') {
    return (
      <div className="scheduler-editor-grid two">
        <label><span>Trabalho minutos</span><input type="number" min="1" max="1440" value={String(payload.workMinutes || '')} onChange={(event) => setPayload({ workMinutes: event.target.value })} /></label>
        <label><span>Pausa minutos</span><input type="number" min="1" max="240" value={String(payload.breakMinutes || '')} onChange={(event) => setPayload({ breakMinutes: event.target.value })} /></label>
      </div>
    );
  }
  if (draft.type === 'allowed_date') {
    return (
      <div className="scheduler-editor-grid three">
        <label><span>Data</span><input type="date" value={String(payload.date || '')} onChange={(event) => setPayload({ date: event.target.value })} /></label>
        <label><span>Inicio opcional</span><input type="time" value={String(payload.startTime || '')} onChange={(event) => setPayload({ startTime: event.target.value })} /></label>
        <label><span>Fim opcional</span><input type="time" value={String(payload.endTime || '')} onChange={(event) => setPayload({ endTime: event.target.value })} /></label>
      </div>
    );
  }
  return (
    <div className="scheduler-editor-stack">
      <span className="scheduler-editor-label">Dias opcionais</span>
      <WeekdayPicker value={numericList(payload.days)} onChange={(days) => setPayload({ days })} />
      <div className="scheduler-editor-grid three">
        <label><span>Inicio opcional</span><input type="time" value={String(payload.startTime || '')} onChange={(event) => setPayload({ startTime: event.target.value })} /></label>
        <label><span>Fim opcional</span><input type="time" value={String(payload.endTime || '')} onChange={(event) => setPayload({ endTime: event.target.value })} /></label>
        <label><span>Peso opcional</span><input type="number" min="1" max="10" value={String(payload.weight || '')} onChange={(event) => setPayload({ weight: event.target.value })} /></label>
      </div>
    </div>
  );
}

function ConstraintDetails({
  constraint,
  copied,
  saving,
  onCopy,
  onSave
}: {
  constraint: SchedulerRuleConstraint;
  copied: boolean;
  saving: boolean;
  onCopy: (constraint: SchedulerRuleConstraint) => void;
  onSave: (constraint: SchedulerRuleConstraint, draft: ConstraintDraft) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => draftFromConstraint(constraint));
  const errors = validateDraft(draft);

  useEffect(() => {
    setDraft(draftFromConstraint(constraint));
    setEditing(false);
  }, [constraint.id]);

  return (
    <article className="scheduler-constraint-card">
      <header>
        <strong>{constraintLabel(constraint)}</strong>
        <span>{constraint.enabled ? 'ativa' : 'desativada'}</span>
      </header>
      {editing ? (
        <div className="scheduler-constraint-editor">
          <div className="scheduler-editor-grid two">
            <label><span>Tipo</span><select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value, payload: {} })}>{CONSTRAINT_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label><span>Forca</span><select value={draft.hard ? 'hard' : 'soft'} onChange={(event) => setDraft({ ...draft, hard: event.target.value === 'hard' })}><option value="hard">Obrigatoria</option><option value="soft">Preferencia</option></select></label>
          </div>

          <div className="scheduler-editor-toggles">
            <label><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} /> <span>Ativa</span></label>
            <label><input type="checkbox" checked={draft.scope.allTasks} onChange={(event) => setDraft({ ...draft, scope: { ...draft.scope, allTasks: event.target.checked } })} /> <span>Todas as tarefas se nao houver filtros</span></label>
          </div>

          <fieldset className="scheduler-editor-fieldset">
            <legend>Escopo seguro</legend>
            <div className="scheduler-editor-grid two">
              <label><span>Tags</span><input value={draft.scope.tags} placeholder="focus, admin" onChange={(event) => setDraft({ ...draft, scope: { ...draft.scope, tags: event.target.value } })} /></label>
              <label><span>Titulo contem</span><input value={draft.scope.titleIncludes} placeholder="invoice, cliente" onChange={(event) => setDraft({ ...draft, scope: { ...draft.scope, titleIncludes: event.target.value } })} /></label>
              <label><span>Task IDs</span><input value={draft.scope.taskIds} placeholder="uuid1, uuid2" onChange={(event) => setDraft({ ...draft, scope: { ...draft.scope, taskIds: event.target.value } })} /></label>
            </div>
            <span className="scheduler-editor-label">Estados</span>
            <div className="scheduler-checkbox-row">{STATUS_OPTIONS.map((status) => <label key={status}><input type="checkbox" checked={draft.scope.statuses.includes(status)} onChange={(event) => setDraft({ ...draft, scope: { ...draft.scope, statuses: selectedStrings(draft.scope.statuses, status, event.target.checked) } })} /><span>{status}</span></label>)}</div>
            <span className="scheduler-editor-label">Prioridades</span>
            <div className="scheduler-checkbox-row">{PRIORITY_OPTIONS.map((priority) => <label key={priority}><input type="checkbox" checked={draft.scope.priorities.includes(priority)} onChange={(event) => setDraft({ ...draft, scope: { ...draft.scope, priorities: selectedNumbers(draft.scope.priorities, priority, event.target.checked) } })} /><span>P{priority}</span></label>)}</div>
          </fieldset>

          <fieldset className="scheduler-editor-fieldset">
            <legend>Parametros seguros</legend>
            <PayloadFields draft={draft} onChange={setDraft} />
          </fieldset>

          {errors.length > 0 && <p className="scheduler-editor-error">{errors.join(' ')}</p>}
          <div className="scheduler-editor-actions">
            <button type="button" className="button primary small" disabled={saving || errors.length > 0} onClick={() => onSave(constraint, draft)}>{saving ? 'A guardar...' : 'Guardar correcao'}</button>
            <button type="button" className="button ghost small" onClick={() => { setDraft(draftFromConstraint(constraint)); setEditing(false); }}>Cancelar</button>
          </div>
        </div>
      ) : (
        <dl>
          <div><dt>Escopo</dt><dd>{formatScope(constraint.scope)}</dd></div>
          <div><dt>Parametros</dt><dd>{formatPayload(constraint.payload)}</dd></div>
          <div>
            <dt>Acoes</dt>
            <dd className="scheduler-constraint-actions">
              <button type="button" className="button secondary small" onClick={() => setEditing(true)}>Editar seguro</button>
              <button type="button" className="button ghost small" onClick={() => onCopy(constraint)}>{copied ? 'Copiado' : 'Copiar JSON'}</button>
            </dd>
          </div>
        </dl>
      )}
    </article>
  );
}

export default function SchedulerRulesView() {
  const [rules, setRules] = useState<SchedulerRule[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingConstraintId, setSavingConstraintId] = useState('');
  const [error, setError] = useState('');
  const [lastCreatedCount, setLastCreatedCount] = useState(0);
  const [copiedConstraintId, setCopiedConstraintId] = useState('');

  const selectedRule = useMemo(() => rules.find((rule) => rule.id === selectedId) || rules[0] || null, [rules, selectedId]);

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
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setSavingConstraintId('');
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

  useEffect(() => { refresh(); }, []);

  return (
    <section className="scheduler-rules-view" aria-label="Regras de agendamento AI">
      <header className="scheduler-rules-header">
        <div>
          <span>Agenda AI</span>
          <h2>Regras de agendamento</h2>
          <p>Escreve preferencias em texto ou corrige restricoes com campos seguros. A app valida o formato antes de guardar.</p>
        </div>
        <button type="button" className="button secondary small" onClick={refresh} disabled={loading}>{loading ? 'A carregar...' : 'Atualizar'}</button>
      </header>

      {error && <p className="advisor-empty">{error}</p>}
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
                <div><span>Detalhes</span><h3>{selectedRule.text}</h3></div>
                <span className={`scheduler-rule-status is-${selectedRule.status}`}>{selectedRule.status}</span>
              </header>

              <dl className="scheduler-rule-summary">
                <div><dt>Interpretacao</dt><dd>{selectedRule.interpretation || 'Sem interpretacao.'}</dd></div>
                <div><dt>Estado</dt><dd>{selectedRule.enabled ? 'Ativa no scheduler' : 'Nao usada no scheduler'}</dd></div>
                <div><dt>Confianca</dt><dd>{selectedRule.confidence != null ? `${Math.round(selectedRule.confidence * 100)}%` : 'Manual ou nao indicada'}</dd></div>
                <div><dt>Modelo</dt><dd>{selectedRule.model || 'Nao indicado'}</dd></div>
              </dl>

              <div className="scheduler-rule-actions">
                <button type="button" className="button secondary small" onClick={() => setRuleEnabled(selectedRule, !selectedRule.enabled)}>{selectedRule.enabled ? 'Desativar' : 'Ativar'}</button>
                <button type="button" className="button secondary small" onClick={() => reinterpret(selectedRule)}>Reinterpretar</button>
                <button type="button" className="button ghost small" onClick={() => removeRule(selectedRule)}>Apagar</button>
              </div>

              <section className="scheduler-constraints-section">
                <h4>Restricoes derivadas</h4>
                {selectedRule.constraints.length ? (
                  <div className="scheduler-constraints-list">
                    {selectedRule.constraints.map((constraint) => (
                      <ConstraintDetails key={constraint.id} constraint={constraint} copied={copiedConstraintId === constraint.id} saving={savingConstraintId === constraint.id} onCopy={copyConstraintPayload} onSave={(item, draft) => saveConstraint(selectedRule, item, draft)} />
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