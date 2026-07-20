import type { TaskWorkSession } from '../../../shared/types';

function taskWorkSessionMetrics(task: { estimatedMinutes?: number | null }, workSessions: TaskWorkSession[], now = Date.now()) {
	const completedWorkMinutes = workSessions
		.filter((session) => session.status === 'completed' || session.status === 'partially_completed')
		.reduce((total, session) => total + session.completedMinutes, 0);
	const plannedFutureWorkMinutes = workSessions
		.filter((session) => session.status === 'planned' && Date.parse(session.plannedEndAt || '') >= now)
		.reduce((total, session) => total + session.plannedMinutes, 0);
	const estimatedMinutes = task.estimatedMinutes == null ? null : Number(task.estimatedMinutes);
	const remainingWorkMinutes = estimatedMinutes == null ? null : Math.max(0, estimatedMinutes - completedWorkMinutes);
	return { completedWorkMinutes, plannedFutureWorkMinutes, remainingWorkMinutes };
}

module.exports = { taskWorkSessionMetrics };

export {};

