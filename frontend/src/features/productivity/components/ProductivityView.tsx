import type { CSSProperties } from 'react';
import type { ProductivityEvent, ProductivitySummary, Task } from '../../../../../shared/types';
import { isToday } from '../../../utils/taskDates';

type ProductivityViewProps = {
  summary: ProductivitySummary;
  loading: boolean;
  onRefresh: () => void | Promise<void>;
  tasks: Task[];
  onOpenTask: (task: Task) => void;
};

const EVENT_LABELS: Record<string, string> = {
  task_completed: 'Tarefa concluida',
  checklist_completed: 'Checklist concluida',
  progress_logged: 'Progresso registado',
  quick_queue_completed: 'Fila rapida concluida',
  task_scheduled: 'Tarefa agendada'
};

const EVENT_HINTS: Record<string, string> = {
  task_completed: 'fecho de ciclo',
  checklist_completed: 'micro-vitoria',
  progress_logged: 'continuidade',
  quick_queue_completed: 'captura limpa',
  task_scheduled: 'intencao no calendario'
};

function xpProgress(summary: ProductivitySummary) {
  const goal = Math.max(1, summary.dailyGoalXp || 50);
  return Math.min(100, Math.round((summary.todayXp / goal) * 100));
}

function remainingXp(summary: ProductivitySummary) {
  return Math.max(0, Math.max(1, summary.dailyGoalXp || 50) - summary.todayXp);
}

function formatEventTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
}

function formatTaskTime(value: string | null) {
  if (!value) return 'Sem hora';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sem hora';
  return new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit' }).format(date);
}

function eventTitle(event: ProductivityEvent) {
  return EVENT_LABELS[event.eventType] || event.eventType.replace(/_/g, ' ');
}

function nextMilestone(summary: ProductivitySummary) {
  if (summary.todayXp < summary.dailyGoalXp) return `${remainingXp(summary)} XP para fechar o objetivo de hoje`;
  if (summary.currentStreak < 3) return 'Mantem o ritmo ate uma streak de 3 dias';
  if (summary.activeDaysThisWeek < 5) return `${5 - summary.activeDaysThisWeek} dias ativos para uma semana forte`;
  return 'Semana forte: protege a streak e evita tarefas soltas';
}

function weeklyCells(activeDays: number) {
  return Array.from({ length: 7 }, (_, index) => index < activeDays);
}

function plannedTodayTasks(tasks: Task[]) {
  return tasks
    .filter((task) => !task.isArchived && task.status !== 'cancelled' && isToday(task))
    .sort((left, right) => {
      const leftTime = left.dueDateTime ? Date.parse(left.dueDateTime) : Number.MAX_SAFE_INTEGER;
      const rightTime = right.dueDateTime ? Date.parse(right.dueDateTime) : Number.MAX_SAFE_INTEGER;
      if (left.status === 'done' && right.status !== 'done') return 1;
      if (left.status !== 'done' && right.status === 'done') return -1;
      return leftTime - rightTime || right.priority - left.priority;
    });
}

function ProductivityEventRow({ event }: { event: ProductivityEvent }) {
  const eventTime = formatEventTime(event.occurredAt);
  return (
    <li className="productivity-event-row">
      <span className="productivity-event-xp">+{event.xp}</span>
      <div>
        <strong>{eventTitle(event)}</strong>
        <small>{EVENT_HINTS[event.eventType] || 'acao produtiva'}{eventTime ? ` - ${eventTime}` : ''}</small>
      </div>
    </li>
  );
}

function PlannedTaskRow({ task, onOpenTask }: { task: Task; onOpenTask: (task: Task) => void }) {
  const calendarCount = task.calendarEvents?.length || 0;
  return (
    <li className={task.status === 'done' ? 'done' : ''}>
      <button type="button" onClick={() => onOpenTask(task)}>
        <span className="productivity-task-time">{formatTaskTime(task.dueDateTime)}</span>
        <div>
          <strong>{task.title}</strong>
          <small>
            P{task.priority} - {task.status}{calendarCount ? ` - ${calendarCount} evento${calendarCount === 1 ? '' : 's'}` : ''}
          </small>
        </div>
        {task.tags.length ? <span className="productivity-task-tags">{task.tags.slice(0, 2).join(', ')}</span> : null}
      </button>
    </li>
  );
}

export default function ProductivityView({ summary, loading, onRefresh, tasks, onOpenTask }: ProductivityViewProps) {
  const goal = Math.max(1, summary.dailyGoalXp || 50);
  const progress = xpProgress(summary);
  const activeWeek = weeklyCells(summary.activeDaysThisWeek);
  const recentEvents = summary.recentEvents.slice(0, 8);
  const todayTasks = plannedTodayTasks(tasks);
  const openTodayTasks = todayTasks.filter((task) => task.status !== 'done').length;
  const progressStyle = { '--progress': `${progress}%` } as CSSProperties;

  return (
    <section className="productivity-view" aria-label="Produtividade">
      <header className="productivity-hero">
        <div>
          <span className="productivity-kicker">Produtividade</span>
          <h2>Streak, XP e consistencia diaria</h2>
          <p>{nextMilestone(summary)}</p>
        </div>
        <button type="button" className="button secondary small" onClick={onRefresh} disabled={loading}>
          {loading ? 'A atualizar...' : 'Atualizar'}
        </button>
      </header>

      <div className="productivity-focus-grid">
        <article className="productivity-goal-card">
          <div className="productivity-goal-ring" style={progressStyle}>
            <strong>{summary.todayXp}</strong>
            <span>XP hoje</span>
          </div>
          <div className="productivity-goal-copy">
            <span className="productivity-kicker">Objetivo diario</span>
            <h3>{progress}% completo</h3>
            <p>{summary.todayXp >= goal ? 'Objetivo de hoje concluido.' : `Faltam ${remainingXp(summary)} XP para chegar aos ${goal} XP.`}</p>
          </div>
        </article>

        <article className="productivity-streak-card">
          <span className="productivity-kicker">Streak atual</span>
          <strong>{summary.currentStreak}</strong>
          <p>Melhor streak: {summary.longestStreak} dias</p>
        </article>

        <article className="productivity-streak-card">
          <span className="productivity-kicker">Acoes hoje</span>
          <strong>{summary.todayEventCount}</strong>
          <p>Concluir, agendar e registar progresso geram XP.</p>
        </article>
      </div>

      <article className="productivity-section productivity-planned-today">
        <header>
          <div>
            <span className="productivity-kicker">Planeado para hoje</span>
            <h3>{todayTasks.length} tarefas hoje</h3>
            <p>{openTodayTasks ? `${openTodayTasks} ainda por confirmar` : todayTasks.length ? 'Tudo confirmado para hoje.' : 'Nenhuma tarefa com prazo para hoje.'}</p>
          </div>
        </header>
        {todayTasks.length ? (
          <ul>
            {todayTasks.map((task) => <PlannedTaskRow key={task.id} task={task} onOpenTask={onOpenTask} />)}
          </ul>
        ) : (
          <p className="empty-column">Sem tarefas planeadas para hoje.</p>
        )}
      </article>

      <div className="productivity-body-grid">
        <article className="productivity-section">
          <header>
            <div>
              <span className="productivity-kicker">Semana</span>
              <h3>{summary.activeDaysThisWeek}/7 dias ativos</h3>
            </div>
          </header>
          <div className="productivity-week-track" aria-label={`${summary.activeDaysThisWeek} dias ativos esta semana`}>
            {activeWeek.map((active, index) => (
              <span key={index} className={active ? 'active' : ''}>{index + 1}</span>
            ))}
          </div>
          <p className="productivity-note">O objetivo inicial e criar continuidade. Depois vale a pena adicionar niveis, badges e desafios semanais.</p>
        </article>

        <article className="productivity-section">
          <header>
            <div>
              <span className="productivity-kicker">Roadmap</span>
              <h3>Proximos estimulos</h3>
            </div>
          </header>
          <ol className="productivity-roadmap">
            <li className={summary.todayXp >= goal ? 'done' : ''}><span />Completar o objetivo diario</li>
            <li className={summary.currentStreak >= 3 ? 'done' : ''}><span />Chegar a 3 dias de streak</li>
            <li className={summary.activeDaysThisWeek >= 5 ? 'done' : ''}><span />Ter 5 dias ativos na semana</li>
            <li><span />Adicionar badges por tipo de acao</li>
          </ol>
        </article>
      </div>

      <article className="productivity-section productivity-recent">
        <header>
          <div>
            <span className="productivity-kicker">Historico recente</span>
            <h3>Ultimos eventos com XP</h3>
          </div>
        </header>
        {recentEvents.length ? (
          <ul>
            {recentEvents.map((event) => <ProductivityEventRow key={event.id} event={event} />)}
          </ul>
        ) : (
          <p className="empty-column">Ainda nao existem eventos de produtividade registados.</p>
        )}
      </article>
    </section>
  );
}
