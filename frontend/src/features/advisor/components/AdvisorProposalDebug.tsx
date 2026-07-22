import { useState } from 'react';
import type { AdvisorPreview } from '../api';

export function AdvisorDebugSummary({ proposals }: { proposals: AdvisorPreview }) {
  const debug = proposals.debug;
  if (!debug) return null;
  const generated = debug.generatedCount || 0;
  const available = debug.afterMemoryFilter ?? proposals.commandCount;
  const filtered = Math.max(0, generated - available);
  const reasons = Object.entries(debug.rejectionReasons || {});
  const rejections = debug.rejections || [];
  const candidateAttempts = debug.candidateAttempts || [];
  const notProposedCandidates = debug.notProposedCandidates || [];
  const candidateTasks = debug.candidateTasks || [];
  const touchedTasks = debug.touchedTasks || [];
  const generatedCommandTypeCounts = Object.entries(debug.generatedCommandTypeCounts || {});
  const availableCommandTypeCounts = Object.entries(debug.availableCommandTypeCounts || {});
  const tagDecisionReasons = debug.tagDecisions || [];
  const tagDecisionCounts = Object.entries(debug.tagDecisionCounts || {});
  const tagDecisionStatusCounts = Object.entries(debug.tagDecisionStatusCounts || {});
  const availableTags = debug.availableTags || [];
  const selectedTagTasks = debug.selectedTagTasks || [];
  const skippedTagTasks = debug.skippedTagTasks || [];
  const pickedTagCounts = Object.entries(debug.pickedTagCounts || {});
  const tagGeneratedCommands = debug.tagGeneratedCommands || [];
  const tagBatches = debug.tagBatches || [];

  return (
    <details className="advisor-debug-summary">
      <summary>{generated} geradas, {available} disponiveis, {filtered} filtradas</summary>
      <div className="advisor-debug-counts">
        {debug.candidateTaskCount != null ? <span>Candidatas: {debug.candidateTaskCount}</span> : null}
        {debug.candidateUntaggedTaskCount != null ? <span>Sem tags candidatas: {debug.candidateUntaggedTaskCount}</span> : null}
        {debug.generatedUntaggedTaskCount != null ? <span>Sem tags geradas: {debug.generatedUntaggedTaskCount}</span> : null}
        {debug.availableUntaggedTaskCount != null ? <span>Sem tags disponiveis: {debug.availableUntaggedTaskCount}</span> : null}
        {debug.notGeneratedUntaggedTaskCount != null ? <span>Sem tags ignoradas pelo AI: {debug.notGeneratedUntaggedTaskCount}</span> : null}
        {debug.notAvailableUntaggedTaskCount != null ? <span>Sem tags nao disponiveis: {debug.notAvailableUntaggedTaskCount}</span> : null}
        {debug.tagDecisionCount != null ? <span>Decisoes tags: {debug.tagDecisionCount}</span> : null}
        {debug.availableTagCount != null ? <span>Tags enviadas: {debug.availableTagCount}</span> : null}
        {debug.selectedTagTaskCount != null ? <span>Tasks enviadas para tags: {debug.selectedTagTaskCount}</span> : null}
        {debug.selectedUntaggedTagTaskCount != null ? <span>Tasks enviadas sem tags: {debug.selectedUntaggedTagTaskCount}</span> : null}
        {debug.touchedTaskCount != null ? <span>Tocadas pelo AI: {debug.touchedTaskCount}</span> : null}
        {debug.availableTaskCount != null ? <span>Tasks disponiveis: {debug.availableTaskCount}</span> : null}
        {debug.candidateTasksWithoutDueDate != null ? <span>Sem due date: {debug.candidateTasksWithoutDueDate}</span> : null}
        {debug.notProposedCount != null ? <span>Nao propostas: {debug.notProposedCount}</span> : null}
        {debug.notProposedWithoutDueDateCount != null ? <span>Nao propostas sem due date: {debug.notProposedWithoutDueDateCount}</span> : null}
        <span>Acao: {debug.afterActionFilter}</span>
        <span>Calendario: {debug.afterCalendarFilter}</span>
        <span>Tempo futuro: {debug.afterPastFilter}</span>
        <span>Duplicados batch: {debug.afterDuplicateBatchFilter}</span>
        <span>Google/ligacao: {debug.afterExistingGoogleFilter}</span>
        <span>Memoria: {debug.afterMemoryFilter}</span>
        {debug.attempts ? <span>Tentativas: {debug.attempts}</span> : null}
      </div>
      {reasons.length ? (
        <div className="advisor-debug-reasons">
          {reasons.map(([reason, count]) => <span key={reason}>{reason}: {count}</span>)}
        </div>
      ) : <p className="advisor-empty">Sem rejeicoes registadas.</p>}
      {generatedCommandTypeCounts.length ? (
        <div className="advisor-debug-reasons">
          <span>Geradas por tipo</span>
          {generatedCommandTypeCounts.map(([type, count]) => <span key={type}>{type}: {count}</span>)}
        </div>
      ) : null}
      {availableCommandTypeCounts.length ? (
        <div className="advisor-debug-reasons">
          <span>Disponiveis por tipo</span>
          {availableCommandTypeCounts.map(([type, count]) => <span key={type}>{type}: {count}</span>)}
        </div>
      ) : null}
      {tagDecisionCounts.length ? (
        <div className="advisor-debug-reasons">
          <span>Decisoes AI</span>
          {tagDecisionCounts.map(([decision, count]) => <span key={decision}>{decision}: {count}</span>)}
        </div>
      ) : null}
      {tagDecisionStatusCounts.length ? (
        <div className="advisor-debug-reasons">
          <span>Resultado final</span>
          {tagDecisionStatusCounts.map(([status, count]) => <span key={status}>{status}: {count}</span>)}
        </div>
      ) : null}
      {availableTags.length ? (
        <div className="advisor-debug-candidates">
          <strong>Tags disponiveis enviadas ao AI</strong>
          <div className="advisor-debug-tag-cloud">
            {availableTags.slice(0, 120).map((tag) => <span key={`available-tag-${tag}`}>#{tag}</span>)}
          </div>
          {availableTags.length > 120 && <p className="advisor-empty">+{availableTags.length - 120} tags adicionais</p>}
        </div>
      ) : null}
      {pickedTagCounts.length ? (
        <div className="advisor-debug-candidates">
          <strong>Tags escolhidas para sugestao</strong>
          <div className="advisor-debug-tag-cloud selected">
            {pickedTagCounts.map(([tag, count]) => <span key={`picked-tag-${tag}`}>#{tag}{Number(count) > 1 ? ` x${count}` : ''}</span>)}
          </div>
        </div>
      ) : null}
      {selectedTagTasks.length ? (
        <div className="advisor-debug-candidates">
          <strong>Tasks enviadas para sugestao de tags</strong>
          <ul>
            {selectedTagTasks.slice(0, 50).map((task) => (
              <li key={`selected-tag-task-${task.taskId}`}>
                <span>{task.taskTitle || task.title || task.taskId}</span>
                <small>
                  {task.existingTags?.length ? `atuais: #${task.existingTags.join(' #')}` : 'sem tags'}
                  {task.notesChars ? ` - notas: ${task.notesChars} chars` : ''}
                </small>
              </li>
            ))}
          </ul>
          {selectedTagTasks.length > 50 && <p className="advisor-empty">+{selectedTagTasks.length - 50} tasks enviadas adicionais</p>}
        </div>
      ) : null}
      {tagGeneratedCommands.length ? (
        <div className="advisor-debug-candidates">
          <strong>Comandos finais de tags</strong>
          <ul>
            {tagGeneratedCommands.slice(0, 40).map((command) => (
              <li key={`tag-command-${command.commandId}`}>
                <span>{command.taskTitle || command.taskId}</span>
                <small>{command.patchTags?.length ? `patch.tags: #${command.patchTags.join(' #')}` : 'sem patch.tags'}</small>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {tagDecisionReasons.length ? (
        <div className="advisor-debug-candidates">
          <strong>Decisoes por task</strong>
          <ul>
            {tagDecisionReasons.slice(0, 40).map((item) => (
              <li key={`tag-decision-${item.taskId}`}>
                <span>{item.taskTitle || item.taskId}</span>
                <small>
                  {item.finalStatus || item.decision} - {item.reason}
                  {item.existingTags?.length ? ` - atuais: #${item.existingTags.join(' #')}` : ' - atuais: sem tags'}
                  {item.suggestedTags?.length ? ` - AI: #${item.suggestedTags.join(' #')}` : ''}
                  {item.newSuggestedTags?.length ? ` - novas: #${item.newSuggestedTags.join(' #')}` : ''}
                  {item.rejectionReason ? ` - motivo final: ${item.rejectionReason}` : ''}
                </small>
              </li>
            ))}
          </ul>
          {tagDecisionReasons.length > 40 && <p className="advisor-empty">+{tagDecisionReasons.length - 40} decisoes adicionais</p>}
        </div>
      ) : null}
      {tagBatches.length ? (
        <div className="advisor-debug-candidates">
          <strong>Batches enviados ao AI</strong>
          <ul>
            {tagBatches.slice(0, 20).map((batch) => (
              <li key={`tag-batch-${batch.batchIndex}`}>
                <span>Batch {batch.batchIndex}/{batch.batchCount}</span>
                <small>{batch.taskCount} tasks - {batch.decisions?.length || 0} decisoes recebidas</small>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {skippedTagTasks.length ? (
        <div className="advisor-debug-candidates">
          <strong>Tasks nao enviadas para tags</strong>
          <ul>
            {skippedTagTasks.slice(0, 30).map((task) => (
              <li key={`skipped-tag-task-${task.taskId}`}>
                <span>{task.taskTitle || task.title || task.taskId}</span>
                <small>{task.reason || 'nao selecionada'} - {task.status || '-'}</small>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {candidateAttempts.length ? (
        <div className="advisor-debug-candidates">
          <strong>Candidatas por tentativa</strong>
          {candidateAttempts.map((attempt) => (
            <article key={`candidate-attempt-${attempt.attempt}`}>
              <div>
                <b>Tentativa {attempt.attempt}</b>
                <span>{attempt.candidateCount} candidatas</span>
                <span>{attempt.candidateTasksWithoutDueDate} sem due date</span>
                <span>{attempt.returnedTaskCount} devolvidas pelo modelo</span>
                <span>{attempt.notProposedCount} nao propostas</span>
              </div>
              {attempt.notProposedCandidates?.length ? (
                <ul>
                  {attempt.notProposedCandidates.slice(0, 20).map((task) => (
                    <li key={`${attempt.attempt}-${task.taskId}`}>
                      <span>{task.taskTitle || task.title || task.taskId}</span>
                      <small>p{task.priority ?? '-'} - {task.status || '-'} - {task.dueDateTime || 'sem due date'}</small>
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
      {touchedTasks.length ? (
        <div className="advisor-debug-candidates">
          <strong>Tasks tocadas pelo AI</strong>
          <ul>
            {touchedTasks.slice(0, 40).map((task) => (
              <li key={`touched-${task.taskId}`}>
                <span>{task.taskTitle || task.title || task.taskId}</span>
                <small>p{task.priority ?? '-'} - {task.status || '-'} - {task.dueDateTime || 'sem due date'}</small>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {candidateTasks.length ? (
        <div className="advisor-debug-candidates">
          <strong>Candidatas analisadas</strong>
          <ul>
            {candidateTasks.slice(0, 40).map((task) => (
              <li key={`candidate-${task.taskId}`}>
                <span>{task.taskTitle || task.title || task.taskId}</span>
                <small>p{task.priority ?? '-'} - {task.status || '-'} - {task.dueDateTime || 'sem due date'}</small>
              </li>
            ))}
          </ul>
          {candidateTasks.length > 40 && <p className="advisor-empty">+{candidateTasks.length - 40} candidatas adicionais</p>}
        </div>
      ) : null}
      {notProposedCandidates.length ? (
        <div className="advisor-debug-candidates">
          <strong>Nao propostas pelo modelo neste request</strong>
          <ul>
            {notProposedCandidates.slice(0, 40).map((task) => (
              <li key={`not-proposed-${task.taskId}`}>
                <span>{task.taskTitle || task.title || task.taskId}</span>
                <small>p{task.priority ?? '-'} - {task.status || '-'} - {task.dueDateTime || 'sem due date'}</small>
              </li>
            ))}
          </ul>
          {notProposedCandidates.length > 40 && <p className="advisor-empty">+{notProposedCandidates.length - 40} candidatas nao propostas</p>}
        </div>
      ) : null}
      {rejections.length ? (
        <div className="advisor-debug-rejections">
          {rejections.slice(0, 30).map((item, index) => (
            <article key={`${item.reason}-${item.commandId || item.taskId || index}`}>
              <strong>{item.reason}</strong>
              <div>
                <span>{item.taskTitle || item.summary || item.taskId || item.commandId || 'Sem task'}</span>
                {item.details ? <small>{item.details}</small> : null}
                {item.memoryRules?.length ? (
                  <div className="advisor-debug-memory">
                    {item.memoryRules.map((rule, ruleIndex) => (
                      <section key={`${item.commandId || item.taskId || index}-memory-${ruleIndex}`}>
                        <b>{rule.ruleType || 'memory'}{rule.supportCount ? ` · ${rule.supportCount}x` : ''}</b>
                        {rule.summary ? <p>{rule.summary}</p> : null}
                        {rule.titleKeywords?.length ? <small>keywords: {rule.titleKeywords.join(', ')}</small> : null}
                        {rule.matchedReasons?.length ? <small>motivos: {rule.matchedReasons.join(', ')}</small> : null}
                      </section>
                    ))}
                  </div>
                ) : null}
              </div>
            </article>
          ))}
          {rejections.length > 30 && <p className="advisor-empty">+{rejections.length - 30} rejeicoes adicionais</p>}
        </div>
      ) : null}
    </details>
  );
}

function decisionSummaryItems(text: string) {
  const normalized = text.replace(/\r/g, '\n').trim();
  const numbered = [...normalized.matchAll(/(?:^|\n)\s*\d+[.)]\s*([\s\S]*?)(?=\n\s*\d+[.)]\s*|$)/g)]
    .map((match) => match[1].replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (numbered.length) return numbered;
  return normalized
    .split(/\n+|(?=\s*\d+[.)]\s+)/)
    .map((item) => item.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter(Boolean);
}

function decisionDetailLabel(detail: string) {
  const value = detail.toLocaleLowerCase();
  if (/\b(\d{1,2}:\d{2}|start|end|inicio|início|fim|hora|slot|agend)/i.test(detail)) return 'Horario';
  if (/busy|ocupad|livre|free|calendar|calendario|calendário|google|evento/i.test(detail)) return 'Agenda';
  if (/rule|regra|constraint|stored|agenda ai|afetou|affected/i.test(detail)) return 'Regras';
  if (/due|prazo|priority|prioridade|duration|dura[cç][aã]o|sinal/i.test(detail)) return 'Sinais';
  if (value.includes('porque') || value.includes('why') || value.includes('selected') || value.includes('escolh')) return 'Motivo';
  return 'Detalhe';
}

function splitDecisionSummaryItem(item: string) {
  const cleaned = item.replace(/\s+/g, ' ').trim();
  const colonIndex = cleaned.indexOf(':');
  const sentenceMatch = cleaned.match(/[.!?]\s/);
  const titleEnd = colonIndex > 5 && colonIndex < 120
    ? colonIndex
    : sentenceMatch?.index != null && sentenceMatch.index < 120
      ? sentenceMatch.index + 1
      : Math.min(cleaned.length, 110);
  const title = cleaned.slice(0, titleEnd).replace(/[:;,.\s]+$/, '').trim() || 'Decisao de agendamento';
  const rest = cleaned.slice(titleEnd + (cleaned[titleEnd] === ':' ? 1 : 0)).trim();
  const details = rest
    .split(/(?:;|\.\s+|\s+\|\s+)/)
    .map((part) => part.trim().replace(/[.;]+$/, ''))
    .filter(Boolean);
  return { title, details: details.length ? details : [cleaned] };
}

function AdvisorDecisionSummary({ summary, enabled }: { summary: string; enabled: boolean }) {
  if (!enabled) return <p>{summary || 'Reve e aplica apenas o que fizer sentido.'}</p>;
  const text = summary || 'Reve e aplica apenas o que fizer sentido.';
  const items = decisionSummaryItems(text);
  if (!items.length) return <p className="advisor-decision-summary-fallback">{text}</p>;
  return (
    <div className="advisor-decision-summary" aria-label="Resumo das decisoes de agendamento">
      <header>
        <span>Resumo das decisoes</span>
        <strong>{items.length} {items.length === 1 ? 'decisao' : 'decisoes'}</strong>
      </header>
      <div className="advisor-decision-list">
        {items.map((item, index) => {
          const decision = splitDecisionSummaryItem(item);
          return (
            <article className="advisor-decision-card" key={`${index}-${item.slice(0, 20)}`}>
              <b>{index + 1}</b>
              <div>
                <strong>{decision.title}</strong>
                <dl>
                  {decision.details.map((detail, detailIndex) => (
                    <div key={`${index}-${detailIndex}-${detail.slice(0, 12)}`}>
                      <dt>{decisionDetailLabel(detail)}</dt>
                      <dd>{detail}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
export function SchedulerDebugReveal({ debug }: { debug?: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!debug) return null;
  const debugJson = JSON.stringify(debug, null, 2);
  async function copyDebugJson() {
    await navigator.clipboard.writeText(debugJson);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }
  return (
    <section className="advisor-scheduler-debug" aria-label="Scheduler debug JSON">
      <div>
        <strong>Scheduler debug</strong>
        <span>Request, response, regras, rotinas, busy events e candidatos usados neste agendamento.</span>
      </div>
      <div className="advisor-scheduler-debug-actions">
        <button type="button" className="button secondary small" onClick={() => setOpen((current) => !current)}>{open ? 'Ocultar debug' : 'Reveal debug JSON'}</button>
        <button type="button" className="button ghost small" onClick={copyDebugJson}>{copied ? 'Copiado' : 'Copiar debug JSON'}</button>
      </div>
      {open && <pre>{debugJson}</pre>}
    </section>
  );
}

export function AdvisorJsonReveal({ proposals }: { proposals: AdvisorPreview }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const advisorJson = JSON.stringify(proposals, null, 2);
  async function copyAdvisorJson() {
    await navigator.clipboard.writeText(advisorJson);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }
  return (
    <section className="advisor-scheduler-debug" aria-label="Advisor response JSON">
      <div>
        <strong>Advisor JSON</strong>
        <span>Resposta completa recebida pelo frontend, incluindo propostas, comandos originais e debug.</span>
      </div>
      <div className="advisor-scheduler-debug-actions">
        <button type="button" className="button secondary small" onClick={() => setOpen((current) => !current)}>{open ? 'Ocultar JSON' : 'Ver JSON'}</button>
        <button type="button" className="button ghost small" onClick={copyAdvisorJson}>{copied ? 'Copiado' : 'Copiar JSON'}</button>
      </div>
      {open && <pre>{advisorJson}</pre>}
    </section>
  );
}

export function EmptyAdvisorProposalReason({ proposals, action }: { proposals: AdvisorPreview; action?: string }) {
  const debug = proposals.debug;
  if (action === 'suggest_tags') {
    const reason = debug?.noSuggestionReason || proposals.summary || 'O AI nao devolveu sugestoes de tags aplicaveis.';
    return (
      <div className="advisor-empty advisor-empty-diagnostic">
        <strong>Sem sugestoes de tags.</strong>
        <span>{reason}</span>
        {debug?.candidateTaskCount != null && (
          <small>
            {debug.candidateTaskCount} candidatas analisadas
            {debug.candidateUntaggedTaskCount != null ? `, ${debug.candidateUntaggedTaskCount} sem tags` : ''}
            {debug.generatedCount != null ? `, ${debug.generatedCount} comandos devolvidos pelo AI` : ''}.
          </small>
        )}
      </div>
    );
  }
  if (debug?.noSuggestionReason) {
    return (
      <div className="advisor-empty advisor-empty-diagnostic">
        <strong>Sem propostas disponiveis.</strong>
        <span>{debug.noSuggestionReason}</span>
        {debug.candidateTaskCount != null && (
          <small>
            {debug.candidateTaskCount} candidatas analisadas
            {debug.generatedCount != null ? `, ${debug.generatedCount} comandos devolvidos pelo AI` : ''}
            {debug.afterMemoryFilter != null ? `, ${debug.afterMemoryFilter} disponiveis depois dos filtros` : ''}.
          </small>
        )}
      </div>
    );
  }
  return <p className="advisor-empty">{proposals.summary || 'O AI nao propos acoes aplicaveis.'}</p>;
}
