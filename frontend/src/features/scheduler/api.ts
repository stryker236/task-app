import { requestJson } from '../../shared/api/requestJson';

export type SchedulerRuleConstraint = {
  id: string;
  ruleId: string;
  type: string;
  scope: Record<string, unknown>;
  payload: Record<string, unknown>;
  hard: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SchedulerRule = {
  id: string;
  text: string;
  interpretation: string;
  status: 'draft' | 'needs_review' | 'active' | 'disabled' | 'invalid';
  enabled: boolean;
  confidence: number | null;
  model: string | null;
  constraints: SchedulerRuleConstraint[];
  createdAt: string;
  updatedAt: string;
};

export type SchedulerRuleUpdate = Partial<Pick<SchedulerRule, 'enabled' | 'status' | 'text'>> & {
  constraints?: Array<Pick<SchedulerRuleConstraint, 'type' | 'scope' | 'payload' | 'hard' | 'enabled'>>;
};

export const getSchedulerRules = () => requestJson<SchedulerRule[]>('/scheduler/rules');
export const createSchedulerRule = (text: string) => requestJson<SchedulerRule>('/scheduler/rules', { method: 'POST', body: JSON.stringify({ text }) });
export const createSchedulerRulesFromText = (text: string) => requestJson<{ rules: SchedulerRule[] }>('/scheduler/rules/from-text', { method: 'POST', body: JSON.stringify({ text }) });
export const updateSchedulerRule = (id: string, patch: SchedulerRuleUpdate) => requestJson<SchedulerRule>(`/scheduler/rules/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
export const reinterpretSchedulerRule = (id: string) => requestJson<SchedulerRule>(`/scheduler/rules/${id}/reinterpret`, { method: 'POST' });
export const deleteSchedulerRule = (id: string) => requestJson<void>(`/scheduler/rules/${id}`, { method: 'DELETE' });
