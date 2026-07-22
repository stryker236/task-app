import type { ProductivitySummary } from '../../../../../shared/types';

type ProductivityPanelProps = {
  summary: ProductivitySummary;
  loading: boolean;
};

export default function ProductivityPanel({ summary, loading }: ProductivityPanelProps) {
  const goal = Math.max(1, summary.dailyGoalXp || 50);
  const progress = Math.min(100, Math.round((summary.todayXp / goal) * 100));

  return (
    <section className="productivity-panel" aria-label="Produtividade diaria">
      <div className="productivity-main">
        <div>
          <span className="productivity-kicker">Hoje</span>
          <strong>{summary.todayXp} XP</strong>
        </div>
        <div className="productivity-progress" aria-label={`${progress}% do objetivo diario`}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <small>{loading ? 'A atualizar...' : `${summary.todayEventCount} acoes produtivas registadas`}</small>
      </div>
      <div className="productivity-stat">
        <span>Streak</span>
        <strong>{summary.currentStreak}</strong>
      </div>
      <div className="productivity-stat">
        <span>Semana</span>
        <strong>{summary.activeDaysThisWeek}/7</strong>
      </div>
      <div className="productivity-stat">
        <span>Melhor</span>
        <strong>{summary.longestStreak}</strong>
      </div>
    </section>
  );
}

