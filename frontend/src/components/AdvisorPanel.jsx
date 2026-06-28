const QUICK_ACTIONS = [
  {
    label: 'Melhorar tasks',
    message: 'Melhora os cartões ativos sem alterar títulos, notas, histórico ou estimativas salvo se for indispensável. Foca em tags, prazo, checklist, dependências, cartões associados e prioridade.'
  },
  {
    label: 'Sugerir tags',
    message: 'Sugere melhorias de tags para os cartões ativos. Reutiliza tags existentes quando fizer sentido, corrige tags inconsistentes e propõe novas tags apenas quando forem claramente úteis. Não alteres título, notas, estado ou histórico.'
  },
  {
    label: 'Criar follow-ups',
    message: 'Analisa as tarefas ativas e propõe criar tarefas de follow-up quando estiver claro que falta trabalho separado.'
  },
  {
    label: 'Organizar bloqueios',
    message: 'Analisa bloqueios, dependências e cartões associados. Propõe relações, blockedByTaskIds ou checklist quando isso tornar o trabalho mais claro.'
  }
];

const COMMAND_LABELS = {
  update_task: 'Atualizar task',
  add_relation: 'Adicionar relação',
  create_task: 'Criar task'
};

const VISIBLE_FIELDS = [
  ['title', 'Título'],
  ['notes', 'Notas'],
  ['priority', 'Prioridade'],
  ['status', 'Estado'],
  ['dueDateTime', 'Prazo'],
  ['estimatedMinutes', 'Estimativa'],
  ['isFavorite', 'Favorita'],
  ['tags', 'Tags'],
  ['blockedByTaskIds', 'Blocked by'],
  ['checklistItems', 'Checklist']
];

function formatValue(value) {
  if (Array.isArray(value) && value.some((item) => item && typeof item === 'object')) {
    return value.length ? value.map((item) => `${item.isDone ? '✓' : '□'} ${item.title}`).join('; ') : '—';
  }
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  if (value === true) return 'sim';
  if (value === false) return 'não';
  if (value == null || value === '') return '—';
  return String(value);
}

function changedFields(before = {}, after = {}) {
  return VISIBLE_FIELDS
    .map(([field, label]) => ({ field, label, before: before[field], after: after[field] }))
    .filter(({ before, after }) => JSON.stringify(before ?? null) !== JSON.stringify(after ?? null));
}

function affectedCardTitle(proposal) {
  if (proposal.type === 'create_task') return proposal.changes?.createdTask?.title || 'Nova task';
  return proposal.changes?.before?.title || proposal.changes?.after?.title || proposal.taskId || 'Task';
}

function ProposalChanges({ proposal }) {
  if (proposal.type === 'create_task') {
    const task = proposal.changes?.createdTask;
    if (!task) return null;
    return (
      <dl className="advisor-change-list">
        <div><dt>Título</dt><dd>{task.title}</dd></div>
        <div><dt>Prioridade</dt><dd>{task.priority}</dd></div>
        <div><dt>Estado</dt><dd>{task.status}</dd></div>
        <div><dt>Tags</dt><dd>{formatValue(task.tags)}</dd></div>
      </dl>
    );
  }

  if (proposal.type === 'add_relation') {
    return (
      <dl className="advisor-change-list">
        <div><dt>Relação</dt><dd>{proposal.relationType}</dd></div>
        <div><dt>Task origem</dt><dd>{proposal.taskId}</dd></div>
        <div><dt>Task relacionada</dt><dd>{proposal.relatedTaskId}</dd></div>
      </dl>
    );
  }

  const changes = changedFields(proposal.changes?.before, proposal.changes?.after);
  if (!changes.length) return <p className="advisor-empty">Sem diferenças materiais.</p>;

  return (
    <dl className="advisor-change-list">
      {changes.map((change) => (
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
  proposals,
  proposalStatuses,
  applyingProposalId,
  applyingAllProposals,
  onApplyProposal,
  onIgnoreProposal,
  onApplyAllProposals,
  onIgnoreAllProposals,
  onClearProposals,
  onOpenTask
}) {
  const commands = proposals?.commands || [];
  if (!proposals) return null;
  const pendingCount = commands.filter((command) => !proposalStatuses[command.id]).length;

  return (
    <section className="advisor-buffer" aria-label="Propostas do assistente">
      <header>
        <div>
          <h3>Propostas para validar</h3>
          <p>{proposals.summary || 'Revê e aplica apenas o que fizer sentido.'}</p>
        </div>
        <div className="advisor-buffer-actions">
          <button
            type="button"
            className="button primary small"
            onClick={onApplyAllProposals}
            disabled={!pendingCount || applyingAllProposals}
          >
            {applyingAllProposals ? 'A aplicar...' : `Aceitar todos${pendingCount ? ` (${pendingCount})` : ''}`}
          </button>
          <button
            type="button"
            className="button secondary small"
            onClick={onIgnoreAllProposals}
            disabled={!pendingCount || applyingAllProposals}
          >
            Ignorar todos
          </button>
          <button type="button" className="button secondary small" onClick={onClearProposals}>
            Limpar buffer
          </button>
        </div>
      </header>

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
                  {proposal.alreadyExists && <small>Esta relação já existe.</small>}
                  <ProposalChanges proposal={proposal} />
                </div>

                <div className="advisor-proposal-actions">
                  {proposal.taskId && (
                    <button type="button" className="button ghost small" onClick={() => onOpenTask(proposal.taskId)}>
                      Abrir task
                    </button>
                  )}
                  <button
                    type="button"
                    className="button primary small"
                    onClick={() => onApplyProposal(proposal.id)}
                    disabled={disabled}
                  >
                    {applyingProposalId === proposal.id ? 'A aplicar...' : status === 'accepted' ? 'Aceite' : 'Aceitar'}
                  </button>
                  <button
                    type="button"
                    className="button secondary small"
                    onClick={() => onIgnoreProposal(proposal.id)}
                    disabled={disabled}
                  >
                    {status === 'ignored' ? 'Ignorada' : 'Ignorar'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="advisor-empty">O AI não propôs ações aplicáveis.</p>
      )}
    </section>
  );
}

export default function AdvisorPanel({
  advice,
  loading,
  request,
  proposals,
  proposalStatuses,
  applyingProposalId,
  applyingAllProposals,
  onRequestChange,
  onRefresh,
  onRequestActions,
  onApplyProposal,
  onIgnoreProposal,
  onApplyAllProposals,
  onIgnoreAllProposals,
  onClearProposals,
  onOpenTask
}) {
  const actions = advice?.actions || [];
  const blockers = advice?.blockers || [];

  return (
    <section className="advisor-panel" aria-label="Assistente de trabalho">
      <header>
        <div>
          <span>Assistente</span>
          <h2>Conselhos e ações assistidas</h2>
        </div>
        <button type="button" className="button secondary small" onClick={onRefresh} disabled={loading}>
          {loading ? 'A pensar...' : 'Gerar conselho'}
        </button>
      </header>

      <div className="advisor-request-box">
        <label htmlFor="advisor-request">Pedir ações ao assistente</label>
        <textarea
          id="advisor-request"
          value={request}
          onChange={(event) => onRequestChange(event.target.value)}
          placeholder="Ex: melhora os cartões ativos, cria follow-ups e sugere relações úteis..."
          rows={3}
        />
        <div className="advisor-request-actions">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.label}
              type="button"
              className="button secondary small"
              onClick={() => onRequestActions(action.message)}
              disabled={loading}
            >
              {action.label}
            </button>
          ))}
          <button
            type="button"
            className="button primary small"
            onClick={() => onRequestActions(request)}
            disabled={loading || !request.trim()}
          >
            Gerar propostas
          </button>
        </div>
        <small>Limite backend: 3 pedidos AI por 10 segundos, por cliente/IP.</small>
      </div>

      <AdvisorProposalBuffer
        proposals={proposals}
        proposalStatuses={proposalStatuses}
        applyingProposalId={applyingProposalId}
        applyingAllProposals={applyingAllProposals}
        onApplyProposal={onApplyProposal}
        onIgnoreProposal={onIgnoreProposal}
        onApplyAllProposals={onApplyAllProposals}
        onIgnoreAllProposals={onIgnoreAllProposals}
        onClearProposals={onClearProposals}
        onOpenTask={onOpenTask}
      />

      {advice?.summary ? (
        <p className="advisor-summary">{advice.summary}</p>
      ) : (
        <p className="advisor-summary">Clica em “Gerar conselho” para uma análise sem aplicar alterações.</p>
      )}
      {advice?.note && <p className="advisor-note">{advice.note}</p>}

      <div className="advisor-grid">
        <div>
          <h3>Próximas ações</h3>
          {actions.length ? actions.map((item, index) => (
            <button type="button" className="advisor-action" key={`${item.taskId}-${index}`} onClick={() => onOpenTask(item.taskId)}>
              <strong>{index + 1}. {item.title}</strong>
              <span>{item.nextStep}</span>
              <small>{item.urgency} | {item.reason}</small>
            </button>
          )) : <p className="advisor-empty">Sem sugestões para já.</p>}
        </div>

        <div>
          <h3>Bloqueios</h3>
          {blockers.length ? blockers.map((item) => (
            <button type="button" className="advisor-blocker" key={item.taskId} onClick={() => onOpenTask(item.taskId)}>
              <strong>{item.title}</strong>
              <span>{item.nextStep}</span>
              <small>{item.reason}</small>
            </button>
          )) : <p className="advisor-empty">Nada bloqueado que precise de atenção.</p>}
        </div>
      </div>
    </section>
  );
}
