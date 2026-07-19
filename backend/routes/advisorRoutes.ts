const express = require('express');
const { ADVISOR_ACTIONS, generateTaskAdvisorAdvice, generateTaskAdvisorCommands, resolveAdvisorAction } = require('../ai/aiAdvisor');
const { createCalendarClient, createOAuthClient } = require('../google/googleClient');
const { decryptJson } = require('../google/tokenCrypto');
const { requestSchedule } = require('../ai/schedulerClient');
const { explainScheduleCommandsWithOpenAi } = require('../ai/scheduleExplanations');
const {
	getAiCommandsFromBody,
	prepareAiCommand,
	applyPreparedAiCommand,
	buildAiCommandsPreview,
	calendarEventDuplicateFingerprint,
	calendarEventStartsInPast,
	findExistingGoogleCalendarEvent
} = require('../ai/aiCommands');
const { createMemoryRateLimit } = require('../middleware/rateLimit');
const { normalizeString, createValidationError } = require('../tasks/taskValidation');
const { logger } = require('../logger');
const {
	advisorPreviewTitle,
	buildAdvisorMemoryContext,
	filterAdvisorCommandPairsByMemory,
	inferAdvisorInteractionMemoryRule,
	inferAdvisorMemoryRule,
	mergeInterpretedRule,
	sanitizeAdvisorFeedback,
	titleFingerprint
} = require('../ai/advisorMemory');
const { interpretAdvisorFeedbackRule } = require('../ai/advisorFeedbackInterpreter');

const aiRateLimit = createMemoryRateLimit({
	windowMs: Number(process.env.AI_RATE_LIMIT_WINDOW_MS || 10000),
	max: Number(process.env.AI_RATE_LIMIT_MAX || 3),
	message: 'AI request rate limit exceeded'
});

function isActiveTaskCalendarEvent(event, now = new Date()) {
	const end = Date.parse(event?.end || event?.endAt || '');
	if (Number.isNaN(end)) return false;
	return end >= now.getTime();
}

function hasActiveTaskCalendarEvent(events = [], now = new Date()) {
	return events.some((event) => isActiveTaskCalendarEvent(event, now));
}

function previewChangedFields(preview) {
	const changes = preview?.changes && typeof preview.changes === 'object' ? preview.changes : {};
	const before = changes.before || {};
	const after = changes.after || {};
	return Object.keys(after).filter((field) => JSON.stringify(before[field] ?? null) !== JSON.stringify(after[field] ?? null));
}

function filterAdvisorCommandPairsByAction({ action, commands = [], previews = [] }) {
	const onlyFieldByAction = {
		priority_management: 'priority',
		suggest_due_dates: 'dueDateTime'
	};
	if (action === 'schedule_calendar_events') {
		const keptCommands = [];
		const keptPreviews = [];
		previews.forEach((preview, index) => {
			if (preview.type !== 'create_calendar_event') return;
			keptPreviews.push(preview);
			keptCommands.push(commands[index]);
		});
		return { commands: keptCommands, previews: keptPreviews };
	}
	const onlyField = onlyFieldByAction[action];
	if (!onlyField) return { commands, previews };
	const keptCommands = [];
	const keptPreviews = [];
	previews.forEach((preview, index) => {
		const changedFields = previewChangedFields(preview);
		if (preview.type !== 'update_task') return;
		if (changedFields.length !== 1 || changedFields[0] !== onlyField) return;
		keptPreviews.push(preview);
		keptCommands.push(commands[index]);
	});
	return { commands: keptCommands, previews: keptPreviews };
}

function toAdvisorCalendar(calendar) {
	return {
		id: calendar.id,
		summary: calendar.summary || '(Sem nome)',
		description: calendar.description || '',
		primary: Boolean(calendar.primary),
		accessRole: calendar.accessRole || '',
		timeZone: calendar.timeZone || null
	};
}

async function fetchWritableAdvisorCalendars({ pool, fetchGoogleConnection, saveGoogleConnection }) {
	if (!pool || !fetchGoogleConnection || !saveGoogleConnection) return [];
	const connection = await fetchGoogleConnection();
	if (!connection) return [];
	const storedTokens = decryptJson(connection.encryptedTokens);
	const authClient = createOAuthClient(storedTokens);
	authClient.on('tokens', (tokens) => {
		saveGoogleConnection(pool, {
			accountEmail: connection.accountEmail,
			scopes: connection.scopes,
			encryptedTokens: { ...storedTokens, ...tokens },
			expiresAt: connection.expiresAt
		}).catch((error) => logger.error('calendar.connection.token_refresh_failed', { metadata: { message: error.message } }));
	});
	const calendar = createCalendarClient(authClient);
	const result = await calendar.calendarList.list({
		minAccessRole: 'writer',
		showDeleted: false,
		showHidden: false
	});
	return (result.data.items || []).map(toAdvisorCalendar).filter((item) => item.id);
}

function filterCalendarCommandsByKnownCalendars({ commands = [], previews = [], calendars = [] }) {
	if (!calendars.length) return { commands, previews };
	const allowedIds = new Set(calendars.map((calendar) => calendar.id));
	const keptCommands = [];
	const keptPreviews = [];
	previews.forEach((preview, index) => {
		if (preview.type === 'create_calendar_event') {
			const calendarId = preview.changes?.calendarEvent?.calendarId || commands[index]?.event?.calendarId || 'primary';
			if (!allowedIds.has(calendarId)) return;
		}
		keptPreviews.push(preview);
		keptCommands.push(commands[index]);
	});
	return { commands: keptCommands, previews: keptPreviews };
}

function filterPastCalendarCommands(commands = [], now = Date.now()) {
	return commands.filter((command) => {
		if (command.type !== 'create_calendar_event') return true;
		return !calendarEventStartsInPast(command.event, now);
	});
}

function filterDuplicateCalendarCommandPairs({ commands = [], previews = [] }) {
	const seenEvents = new Set();
	const keptCommands = [];
	const keptPreviews = [];
	previews.forEach((preview, index) => {
		if (preview.type === 'create_calendar_event') {
			const event = commands[index]?.event || preview.changes?.calendarEvent;
			const fingerprint = event ? calendarEventDuplicateFingerprint(event) : '';
			if (fingerprint && seenEvents.has(fingerprint)) return;
			if (fingerprint) seenEvents.add(fingerprint);
			if (preview.alreadyExists) return;
		}
		keptPreviews.push(preview);
		keptCommands.push(commands[index]);
	});
	return { commands: keptCommands, previews: keptPreviews };
}

async function filterExistingGoogleCalendarCommandPairs({ commands = [], previews = [], dependencies }) {
	const checkedEvents = new Map();
	const pairs = await Promise.all(previews.map(async (preview, index) => {
		if (preview.type !== 'create_calendar_event') return { command: commands[index], preview };
		if (preview.taskId && dependencies.fetchTaskCalendarEvents) {
			const linkedEvents = await dependencies.fetchTaskCalendarEvents(dependencies.pool, preview.taskId);
			if (hasActiveTaskCalendarEvent(linkedEvents)) return null;
		}
		const event = commands[index]?.event || preview.changes?.calendarEvent;
		if (!event) return { command: commands[index], preview };
		const fingerprint = calendarEventDuplicateFingerprint(event);
		if (!checkedEvents.has(fingerprint)) {
			checkedEvents.set(fingerprint, findExistingGoogleCalendarEvent(event, dependencies));
		}
		const existingEvent = await checkedEvents.get(fingerprint);
		if (existingEvent) return null;
		return { command: commands[index], preview };
	}));
	const keptPairs = pairs.filter(Boolean);
	return {
		commands: keptPairs.map((pair) => pair.command),
		previews: keptPairs.map((pair) => pair.preview)
	};
}

function addCalendarLabelsToPreviews(previews = [], calendars = []) {
	if (!calendars.length) return previews;
	const calendarsById = new Map(calendars.map((calendar) => [calendar.id, calendar]));
	return previews.map((preview) => {
		if (preview.type !== 'create_calendar_event') return preview;
		const changes = preview.changes && typeof preview.changes === 'object' ? preview.changes : {};
		const event = changes.calendarEvent && typeof changes.calendarEvent === 'object' ? changes.calendarEvent : null;
		if (!event?.calendarId) return preview;
		const calendar = calendarsById.get(event.calendarId);
		if (!calendar) return preview;
		return {
			...preview,
			changes: {
				...changes,
				calendarEvent: {
					...event,
					calendarSummary: calendar.summary,
					calendarPrimary: calendar.primary
				}
			}
		};
	});
}

function defaultAdvisorCalendarId(calendars = [], requestedCalendarId = '') {
	if (requestedCalendarId && calendars.some((calendar) => calendar.id === requestedCalendarId)) return requestedCalendarId;
	return calendars.find((calendar) => String(calendar.summary || '').toLocaleLowerCase() === 'aiadvisor')?.id
		|| calendars.find((calendar) => calendar.primary)?.id
		|| calendars[0]?.id
		|| 'primary';
}

function defaultAdvisorCalendar(calendars = [], requestedCalendarId = '') {
	if (requestedCalendarId) {
		const requested = calendars.find((calendar) => calendar.id === requestedCalendarId);
		if (requested) return requested;
	}
	return calendars.find((calendar) => String(calendar.summary || '').toLocaleLowerCase() === 'aiadvisor')
		|| calendars.find((calendar) => calendar.primary)
		|| calendars[0]
		|| null;
}

function applyDefaultCalendarToCommands(commands = [], calendars = [], requestedCalendarId = '') {
	const defaultCalendar = defaultAdvisorCalendar(calendars, requestedCalendarId);
	const defaultCalendarId = defaultCalendar?.id || defaultAdvisorCalendarId(calendars, requestedCalendarId);
	const defaultCalendarSummary = defaultCalendar?.summary || defaultCalendarId;
	return commands.map((command) => {
		if (command.type !== 'create_calendar_event') return command;
		const event = command.event && typeof command.event === 'object' ? command.event : {};
		return {
			...command,
			event: {
				...event,
				calendarId: defaultCalendarId,
				calendarSelectionReason: `default calendar: ${defaultCalendarSummary}`
			}
		};
	});
}

function compactRejection(reason: string, command: any = {}, preview: any = null, attempt = 1, details = '', extra: Record<string, any> = {}) {
	return {
		status: reason,
		reason,
		attempt,
		commandId: preview?.id || command.id || '',
		taskId: preview?.taskId || command.taskId || null,
		taskTitle: preview?.taskTitle || null,
		summary: preview?.summary || command.event?.summary || command.label || '',
		details,
		...extra
	};
}

function addDebugCount(debug: Record<string, any>, key: string, count: number) {
	debug[key] = (debug[key] || 0) + count;
}

function countRejectionReasons(rejections: any[]) {
	return rejections.reduce((counts, rejection) => {
		counts[rejection.reason] = (counts[rejection.reason] || 0) + 1;
		return counts;
	}, {});
}

function calendarTitleFingerprint(event: any) {
	return [
		normalizeString(event?.calendarId) || 'primary',
		normalizeString(event?.summary).toLocaleLowerCase().replace(/\s+/g, ' ').trim()
	].join('|');
}

function compactCandidateTask(task: any, attempt?: number) {
	return {
		attempt,
		taskId: task.id,
		taskTitle: task.title || '',
		title: task.title || '',
		status: task.status || '',
		priority: task.priority ?? null,
		dueDateTime: task.dueDateTime || null,
		hasDueDateTime: Boolean(task.dueDateTime),
		createdAt: task.createdAt || null,
		updatedAt: task.updatedAt || null
	};
}

function isEligibleCalendarTask(task: any) {
	return task && !task.isArchived && ['new', 'in_progress'].includes(task.status);
}

function taskDurationMinutes(task: any) {
	const value = Number(task.estimatedMinutes || 0);
	return Number.isFinite(value) && value > 0 ? Math.max(15, Math.min(240, Math.round(value))) : 30;
}

function periodBounds(period = 'week', now = new Date()) {
	const start = new Date(now);
	start.setHours(0, 0, 0, 0);
	if (period === 'month') {
		start.setDate(1);
		const end = new Date(start);
		end.setMonth(end.getMonth() + 1);
		return { start, end };
	}
	const day = start.getDay();
	const mondayOffset = day === 0 ? -6 : 1 - day;
	start.setDate(start.getDate() + mondayOffset);
	const end = new Date(start);
	end.setDate(end.getDate() + 7);
	return { start, end };
}

function occurrenceInPeriod(occurrence: any, bounds: { start: Date; end: Date }) {
	const start = Date.parse(occurrence.scheduledStart || '');
	return !Number.isNaN(start) && start >= bounds.start.getTime() && start < bounds.end.getTime();
}

function periodicConstraintActive(constraint: any, now = new Date()) {
	if (!constraint?.active) return false;
	if (!constraint.expiresAt) return true;
	const expires = Date.parse(constraint.expiresAt);
	return Number.isNaN(expires) || expires >= now.getTime();
}

function normalizePeriodicWindow(window: any = {}) {
	return {
		startTime: normalizeString(window.startTime || window.start),
		endTime: normalizeString(window.endTime || window.end),
		...(Array.isArray(window.days) ? { days: window.days } : {})
	};
}

function periodicOccurrenceCountsByDay(task: any) {
	const counts: Record<string, number> = {};
	for (const occurrence of task.occurrences || []) {
		if (!['scheduled', 'completed'].includes(occurrence.status)) continue;
		const start = Date.parse(occurrence.scheduledStart || '');
		if (Number.isNaN(start)) continue;
		const day = new Date(start).toISOString().slice(0, 10);
		counts[day] = (counts[day] || 0) + 1;
	}
	return counts;
}
function periodicTaskConstraintsForCandidate(task: any, candidateId: string, now = new Date()) {
	const constraints = [];
	const hard = task.hardConstraints && typeof task.hardConstraints === 'object' ? task.hardConstraints : {};
	const allowedDays = Array.isArray(hard.allowedDays) ? hard.allowedDays : [];
	const allowedWindows = Array.isArray(hard.allowedWindows) ? hard.allowedWindows : [];
	const maxOccurrencesPerDay = Number(hard.maxOccurrencesPerDay || 0);
	for (const [index, window] of allowedWindows.entries()) {
		const payload = normalizePeriodicWindow(window);
		if (allowedDays.length && !payload.days) payload.days = allowedDays;
		if (payload.startTime && payload.endTime) {
			constraints.push({
				id: `periodic:${task.id}:allowed_window:${index}`,
				ruleId: `periodic:${task.id}`,
				type: 'allowed_window',
				payload,
				hard: true
			});
		}
	}
	if (allowedDays.length && !allowedWindows.length) {
		constraints.push({
			id: `periodic:${task.id}:allowed_days`,
			ruleId: `periodic:${task.id}`,
			type: 'allowed_window',
			payload: { days: allowedDays, startTime: '00:00', endTime: '23:59' },
			hard: true
		});
	}
	if (maxOccurrencesPerDay > 0) {
		constraints.push({
			id: `periodic:${task.id}:max_occurrences_per_day`,
			ruleId: `periodic:${task.id}`,
			type: 'daily_limit',
			payload: { max: Math.max(1, Math.floor(maxOccurrencesPerDay)), initialCounts: periodicOccurrenceCountsByDay(task) },
			hard: true
		});
	}
	for (const constraint of task.constraints || []) {
		if (!periodicConstraintActive(constraint, now)) continue;
		const payload = constraint.payload || {};
		const scope = constraint.scope || {};
		if (constraint.type === 'fixed_occurrence' && payload.start && payload.end) {
			constraints.push({
				id: constraint.id,
				ruleId: `periodic:${task.id}`,
				type: 'allowed_date',
				payload: {
					date: new Date(payload.start).toISOString().slice(0, 10),
					startTime: new Date(payload.start).toISOString().slice(11, 16),
					endTime: new Date(payload.end).toISOString().slice(11, 16)
				},
				hard: true,
				fixedStart: payload.start,
				fixedEnd: payload.end,
				candidateId
			});
		}
		if (constraint.type === 'allowed_window') {
			const date = normalizeString(scope.date || payload.date);
			const normalized = normalizePeriodicWindow(payload);
			constraints.push({
				id: constraint.id,
				ruleId: `periodic:${task.id}`,
				type: date ? 'allowed_date' : 'allowed_window',
				payload: { ...normalized, ...(date ? { date } : {}) },
				hard: constraint.hard !== false
			});
		}
	}
	return constraints;
}

function periodicTaskTargetCount(task: any, bounds: { start: Date; end: Date }) {
	const activeMinimums = (task.constraints || [])
		.filter((constraint) => constraint.active && constraint.type === 'minimum_count')
		.filter((constraint) => {
			const scope = constraint.scope || {};
			const weekStart = normalizeString(scope.weekStart);
			const month = normalizeString(scope.month);
			if (weekStart) return weekStart === bounds.start.toISOString().slice(0, 10);
			if (month) return month === bounds.start.toISOString().slice(0, 7);
			return true;
		})
		.map((constraint) => Number(constraint.payload?.count || 0))
		.filter((count) => Number.isFinite(count) && count > 0);
	return Math.max(Number(task.targetCount || 1), ...activeMinimums);
}

function buildPeriodicSchedulerCandidates(periodicTasks: any[] = [], now = new Date()) {
	const candidates = [];
	const taskConstraints: Record<string, any[]> = {};
	const fixedConstraints = [];
	const spacingBusy = [];
	for (const task of periodicTasks.filter((item) => item.active)) {
		const bounds = periodBounds(task.period, now);
		const occurrences = (task.occurrences || []).filter((occurrence) => occurrenceInPeriod(occurrence, bounds));
		const completedCount = occurrences.filter((occurrence) => ['scheduled', 'completed'].includes(occurrence.status)).length;
		const remaining = Math.max(0, periodicTaskTargetCount(task, bounds) - completedCount);
		const minSpacingHours = Number(task.hardConstraints?.minSpacingHours || 0);
		if (minSpacingHours > 0) {
			for (const occurrence of occurrences) {
				const start = Date.parse(occurrence.scheduledStart || '');
				const end = Date.parse(occurrence.scheduledEnd || '');
				if (!Number.isNaN(start) && !Number.isNaN(end)) {
					spacingBusy.push({
						calendarId: `periodic-spacing:${task.id}`,
						start: new Date(start - minSpacingHours * 60 * 60 * 1000).toISOString(),
						end: new Date(end + minSpacingHours * 60 * 60 * 1000).toISOString()
					});
				}
			}
		}
		for (let index = 0; index < remaining; index += 1) {
			const id = `periodic:${task.id}:${index + 1}`;
			const constraints = periodicTaskConstraintsForCandidate(task, id, now);
			const fixed = constraints.find((constraint) => constraint.fixedStart);
			candidates.push({
				id,
				periodicTaskId: task.id,
				title: task.title,
				notes: task.notes || '',
				estimatedMinutes: task.estimatedMinutes || 30,
				dueDateTime: fixed?.fixedStart || null
			});
			taskConstraints[id] = constraints.map(({ fixedStart, fixedEnd, candidateId, ...constraint }) => constraint);
			if (fixed) fixedConstraints.push({ taskId: id, fixedStart: fixed.fixedStart, fixedEnd: fixed.fixedEnd || null });
		}
	}
	return { candidates, taskConstraints, fixedConstraints, spacingBusy };
}

function taskMatchesConstraintScope(task: any, scope: any = {}) {
	const keys = scope && typeof scope === 'object' && !Array.isArray(scope) ? Object.keys(scope) : [];
	if (!keys.length) return true;
	if (scope.allTasks === true) return true;
	const taskId = String(task.id || '');
	if (Array.isArray(scope.taskIds) && scope.taskIds.map(String).includes(taskId)) return true;
	const tags = Array.isArray(task.tags) ? task.tags.map((tag) => String(tag).toLocaleLowerCase()) : [];
	if (Array.isArray(scope.tags) && scope.tags.some((tag) => tags.includes(String(tag).toLocaleLowerCase()))) return true;
	const title = String(task.title || '').toLocaleLowerCase();
	if (Array.isArray(scope.titleIncludes) && scope.titleIncludes.some((term) => title.includes(String(term).toLocaleLowerCase()))) return true;
	if (Array.isArray(scope.statuses) && scope.statuses.map(String).includes(String(task.status || ''))) return true;
	if (Array.isArray(scope.priorities) && scope.priorities.map(Number).includes(Number(task.priority))) return true;
	return false;
}

function resolveSchedulerRulesForTasks(rules: any[] = [], tasks: any[] = []) {
	const taskConstraints: Record<string, any[]> = {};
	for (const rule of rules) {
		for (const constraint of rule.constraints || []) {
			for (const task of tasks) {
				if (!taskMatchesConstraintScope(task, constraint.scope)) continue;
				const taskId = String(task.id);
				taskConstraints[taskId] = [...(taskConstraints[taskId] || []), {
					id: constraint.id,
					ruleId: rule.id,
					type: constraint.type,
					payload: constraint.payload || {},
					hard: constraint.hard !== false
				}];
			}
		}
	}
	return taskConstraints;
}

function schedulerConstraintMap(constraints: any[] = []) {
	return new Map((Array.isArray(constraints) ? constraints : [])
		.filter((item) => item?.taskId && item.start)
		.map((item) => [String(item.taskId), {
			fixedStart: normalizeString(item.start),
			fixedEnd: normalizeString(item.end)
		}]));
}

function sanitizeReservedBlocks(blocks: any[] = []) {
	return (Array.isArray(blocks) ? blocks : [])
		.map((block) => ({
			type: normalizeString(block?.type) || 'break',
			start: normalizeString(block?.start),
			end: normalizeString(block?.end),
			reason: normalizeString(block?.reason),
			sourceRuleId: normalizeString(block?.sourceRuleId) || null,
			sourceConstraintId: normalizeString(block?.sourceConstraintId) || null
		}))
		.filter((block) => {
			const start = Date.parse(block.start);
			const end = Date.parse(block.end);
			return block.type === 'break' && !Number.isNaN(start) && !Number.isNaN(end) && end > start;
		});
}

function scheduleHorizon(tasks: any[], constraints: Map<string, any>, now = new Date()) {
	const fallback = now.getTime() + 14 * 24 * 60 * 60 * 1000;
	const latest = tasks.reduce((max, task) => {
		const due = Date.parse(task.dueDateTime || '');
		const fixed = Date.parse(constraints.get(String(task.id))?.fixedStart || '');
		return Math.max(max, Number.isNaN(due) ? 0 : due, Number.isNaN(fixed) ? 0 : fixed);
	}, fallback);
	return new Date(Math.max(fallback, latest) + 24 * 60 * 60 * 1000).toISOString();
}

async function fetchAdvisorBusyEvents({ pool, fetchGoogleConnection, saveGoogleConnection, calendarId, calendarIds, timeMin, timeMax }: any) {
	if (!pool || !fetchGoogleConnection || !saveGoogleConnection) return [];
	const connection = await fetchGoogleConnection();
	if (!connection) return [];
	const storedTokens = decryptJson(connection.encryptedTokens);
	const authClient = createOAuthClient(storedTokens);
	authClient.on('tokens', (tokens) => {
		saveGoogleConnection(pool, {
			accountEmail: connection.accountEmail,
			scopes: connection.scopes,
			encryptedTokens: { ...storedTokens, ...tokens },
			expiresAt: connection.expiresAt
		}).catch((error) => logger.error('calendar.connection.token_refresh_failed', { metadata: { message: error.message } }));
	});
	const calendar = createCalendarClient(authClient);
	const ids = [...new Set((Array.isArray(calendarIds) && calendarIds.length ? calendarIds : [calendarId]).filter(Boolean))];
	const results = await Promise.all(ids.map(async (id) => {
		try {
			const result = await calendar.events.list({
				calendarId: id,
				timeMin,
				timeMax,
				singleEvents: true,
				showDeleted: false,
				maxResults: 2500,
				orderBy: 'startTime'
			});
			return (result.data.items || []).map((event) => ({
				calendarId: id,
				summary: event.summary || '',
				start: event.start?.dateTime || event.start?.date || '',
				end: event.end?.dateTime || event.end?.date || ''
			})).filter((event) => event.start && event.end);
		} catch (error: any) {
			logger.warn('advisor.calendar.busy_fetch_failed', { metadata: { calendarId: id, message: error.message } });
			return [];
		}
	}));
	return results.flat();
}

async function scheduleCalendarCommandsWithMicroservice({ tasks, calendars, requestedDefaultCalendarId, constraints, scheduleStartFrom, dependencies }: any) {
	const defaultCalendar = defaultAdvisorCalendar(calendars, requestedDefaultCalendarId);
	const calendarId = defaultCalendar?.id || defaultAdvisorCalendarId(calendars, requestedDefaultCalendarId);
	const calendarSummary = defaultCalendar?.summary || calendarId;
	const calendarTimeZone = defaultCalendar?.timeZone || 'Europe/Lisbon';
	const fixedConstraints = schedulerConstraintMap(constraints);
	const linkedResults = await Promise.all(tasks.map(async (task) => ({
		task,
		linkedEvents: task?.id && dependencies.fetchTaskCalendarEvents
			? await dependencies.fetchTaskCalendarEvents(dependencies.pool, task.id)
			: []
	})));
	const eligibleTasks = linkedResults
		.filter(({ task, linkedEvents }) => isEligibleCalendarTask(task) && !hasActiveTaskCalendarEvent(linkedEvents))
		.map(({ task }) => task);
	const periodicTasks = dependencies.fetchPeriodicTasks
		? await dependencies.fetchPeriodicTasks(dependencies.pool, { activeOnly: true, includeOccurrences: true })
		: [];
	const periodicScheduler = buildPeriodicSchedulerCandidates(periodicTasks, new Date());
	const schedulerCandidates = [...eligibleTasks, ...periodicScheduler.candidates];
	const activeSchedulerRules = dependencies.fetchActiveSchedulerRules
		? await dependencies.fetchActiveSchedulerRules(dependencies.pool)
		: [];
	const taskConstraints = resolveSchedulerRulesForTasks(activeSchedulerRules, eligibleTasks);
	for (const [taskId, periodicConstraints] of Object.entries(periodicScheduler.taskConstraints)) {
		taskConstraints[taskId] = [...(taskConstraints[taskId] || []), ...(periodicConstraints as any[])];
	}
	const requestedStart = Date.parse(String(scheduleStartFrom || ''));
	const nowDate = Number.isNaN(requestedStart) ? new Date() : new Date(Math.max(Date.now(), requestedStart));
	const now = nowDate.toISOString();
	const periodicFixedMap = new Map(periodicScheduler.fixedConstraints.map((item) => [String(item.taskId), item]));
	const combinedFixedConstraints = new Map([...fixedConstraints.entries(), ...periodicFixedMap.entries()]);
	const horizonEnd = scheduleHorizon(schedulerCandidates, combinedFixedConstraints, nowDate);
	const busy = await fetchAdvisorBusyEvents({
		...dependencies,
		calendarId,
		calendarIds: calendars.map((calendar) => calendar.id),
		timeMin: now,
		timeMax: horizonEnd
	});
	const calendarSummaryById = new Map(calendars.map((calendar) => [String(calendar.id), calendar.summary || String(calendar.id)]));
	const busyWithCalendarSummaries = busy.map((event) => ({
		...event,
		calendarSummary: calendarSummaryById.get(String(event.calendarId)) || String(event.calendarId || '')
	}));
	const reservedBusy = [];
	const schedulerRequest = {
		now,
		horizonEnd,
		timeZone: calendarTimeZone,
		busy: [...busyWithCalendarSummaries, ...reservedBusy, ...periodicScheduler.spacingBusy],
		taskConstraints,
		constraints: [...combinedFixedConstraints.entries()].map(([taskId, constraint]) => ({
			taskId,
			fixedStart: constraint.fixedStart,
			fixedEnd: constraint.fixedEnd || null
		})),
		tasks: schedulerCandidates.map((task) => ({
			id: task.id,
			title: task.title || '',
			durationMinutes: taskDurationMinutes(task),
			dueDateTime: task.dueDateTime || null,
			periodicTaskId: task.periodicTaskId || null,
			...(combinedFixedConstraints.get(String(task.id)) || {})
		}))
	};
	const scheduled = await requestSchedule(schedulerRequest);
	const tasksById = new Map(schedulerCandidates.map((task) => [String(task.id), task]));
	const reservedBlockCommands = (scheduled.reserved || []).map((block, index) => ({
		id: `schedule_break_${index + 1}`,
		type: 'create_calendar_event',
		taskId: null,
		periodicTaskId: null,
		reason: block.reason === 'break_after_task'
			? 'Pausa criada pela regra de descanso apos uma tarefa longa.'
			: 'Pausa criada pela regra de descanso entre blocos de trabalho.',
		event: {
			summary: 'Pausa',
			description: block.reason || 'scheduler break',
			location: '',
			start: block.start,
			end: block.end,
			timeZone: calendarTimeZone,
			calendarId,
			calendarSelectionReason: `default calendar: ${calendarSummary}`
		}
	}));
	let commands = scheduled.scheduled.map((item) => {
		const task = tasksById.get(String(item.taskId));
		const fixed = combinedFixedConstraints.has(String(item.taskId));
		const appliedRules = (item.appliedConstraintIds || [])
			.map((constraintId) => {
				const rule = activeSchedulerRules.find((candidate) => (candidate.constraints || []).some((constraint) => String(constraint.id) === String(constraintId)));
				const constraint = (rule?.constraints || []).find((item) => String(item.id) === String(constraintId));
				return rule ? { ruleId: rule.id, constraintId: String(constraintId), title: rule.text, type: constraint?.type || '', payload: constraint?.payload || {} } : null;
			})
			.filter(Boolean);
		const periodicTaskId = task?.periodicTaskId || null;
		const baseReason = periodicTaskId
			? (fixed ? 'Rotina periodica com horario fixo.' : 'Rotina periodica encaixada pelo scheduler.')
			: (fixed ? 'Horario ajustado pelo utilizador e reagendado pelo scheduler.' : 'Horario escolhido pelo scheduler no proximo slot livre.');
		return {
			id: `schedule_${item.taskId}`,
			type: 'create_calendar_event',
			taskId: periodicTaskId ? null : item.taskId,
			periodicTaskId,
			reason: appliedRules.length ? `${baseReason} Regras consideradas: ${appliedRules.slice(0, 2).map((rule) => rule.title).join('; ')}.` : baseReason,
			appliedRules,
			fixed,
			event: {
				summary: task?.title || 'Task',
				description: task?.notes || '',
				location: '',
				start: item.start,
				end: item.end,
				timeZone: calendarTimeZone,
				calendarId,
				calendarSelectionReason: `default calendar: ${calendarSummary}`
			}
		};
	});
	commands = [...commands, ...reservedBlockCommands];
	const explanationModel = null;
	const explanationSummary = '';
	return {
		commands,
		explanationModel,
		explanationSummary,
		reservedBlocks: [],
		debug: {
			schedulerDebug: {
				generatedAt: new Date().toISOString(),
				scheduleStartFrom: scheduleStartFrom || '',
				defaultCalendar: { id: calendarId, summary: calendarSummary, timeZone: calendarTimeZone },
				schedulerRequest,
				schedulerResponse: scheduled,
				context: {
					eligibleTasks: eligibleTasks.map((task) => compactCandidateTask(task)),
					periodicTasks: periodicTasks.map((task) => ({
						id: task.id,
						title: task.title,
						period: task.period,
						targetCount: task.targetCount,
						estimatedMinutes: task.estimatedMinutes,
						hardConstraints: task.hardConstraints || {},
						constraints: task.constraints || [],
						occurrences: task.occurrences || []
					})),
					periodicCandidates: periodicScheduler.candidates.map((task) => compactCandidateTask(task)),
					periodicSpacingBusy: periodicScheduler.spacingBusy,
					activeSchedulerRules,
					googleBusyEvents: busyWithCalendarSummaries,
					committedReservedBusy: reservedBusy,
					manualFixedConstraints: [...fixedConstraints.entries()].map(([taskId, constraint]) => ({ taskId, ...constraint })),
					combinedFixedConstraints: [...combinedFixedConstraints.entries()].map(([taskId, constraint]) => ({ taskId, ...constraint }))
				}
			},
			generatedCount: eligibleTasks.length,
			afterActionFilter: commands.length,
			afterCalendarFilter: commands.length,
			afterPastFilter: commands.length,
			afterDuplicateBatchFilter: commands.length,
			afterExistingGoogleFilter: commands.length,
			afterMemoryFilter: commands.length,
			candidateTaskCount: schedulerCandidates.length,
			periodicCandidateCount: periodicScheduler.candidates.length,
			candidateTasksWithDueDate: eligibleTasks.filter((task) => task.dueDateTime).length,
			candidateTasksWithoutDueDate: eligibleTasks.filter((task) => !task.dueDateTime).length,
			rejectedCount: scheduled.unscheduled.length,
			activeSchedulerRuleCount: activeSchedulerRules.length,
			schedulerHorizonEnd: horizonEnd,
			schedulerBusyEventCount: busyWithCalendarSummaries.length,
			schedulerReservedBusyCount: reservedBusy.length,
			reservedBlockCount: (scheduled.reserved || []).length,
			rejectionReasons: countRejectionReasons(scheduled.unscheduled.map((item) => ({ reason: item.reason }))),
			rejections: scheduled.unscheduled.map((item) => {
				const task = tasksById.get(String(item.taskId));
				return compactRejection('unscheduled', { taskId: item.taskId, event: { summary: task?.title || item.taskId } }, null, 1, item.reason);
			}),
			notProposedCount: scheduled.unscheduled.length,
			notProposedCandidates: scheduled.unscheduled.map((item) => compactCandidateTask(tasksById.get(String(item.taskId)) || { id: item.taskId, title: item.taskId }))
		}
	};
}

function scheduleExplanationInputFromDebug(commands: any[] = [], schedulerDebug: any = {}) {
	const context = schedulerDebug.context || {};
	const schedulerRequest = schedulerDebug.schedulerRequest || {};
	const schedulerResponse = schedulerDebug.schedulerResponse || {};
	const taskItems: any[] = [
		...(context.eligibleTasks || []),
		...(context.periodicCandidates || []),
		...(context.periodicTasks || [])
	];
	const taskEntries = taskItems
		.map((task): [string, Record<string, any>] => {
			const id = String(task.taskId || task.id || '');
			return [id, {
				id,
				title: task.taskTitle || task.title || '',
				status: task.status || '',
				priority: task.priority || 0,
				dueDateTime: task.dueDateTime || null,
				estimatedMinutes: task.estimatedMinutes || null,
				tags: task.tags || [],
				blockedByTaskIds: task.blockedByTaskIds || []
			}];
		})
		.filter(([id]) => Boolean(id));
	const tasksById = new Map(taskEntries);
	return {
		commands,
		tasksById,
		busyEvents: context.googleBusyEvents || [],
		schedulerRules: context.activeSchedulerRules || [],
		reservedBlocks: schedulerResponse.reserved || [],
		now: schedulerRequest.now || '',
		horizonEnd: schedulerRequest.horizonEnd || '',
		timeZone: schedulerRequest.timeZone || schedulerDebug.defaultCalendar?.timeZone || ''
	};
}
function createAdvisorRouter({
	fetchTasks,
	fetchTags,
	withTransaction,
	updateTaskRecord,
	insertActivity,
	insertTask,
	findTaskById,
	pool,
	fetchGoogleConnection,
	saveGoogleConnection,
	fetchAdvisorMemoryRules,
	saveAdvisorFeedback,
	upsertAdvisorMemoryRule,
	updateAdvisorMemoryRule,
	deleteAdvisorMemoryRule,
	fetchTaskCalendarEvents,
	insertTaskCalendarEvent,
	createProductivityEvent,
	fetchCommittedSchedulerReservedBlocks,
	createSchedulerScheduleBatch,
	fetchActiveSchedulerRules,
	fetchPeriodicTasks,
	createPeriodicTaskOccurrence
}) {
	const router = express.Router();

	router.get('/advisor', aiRateLimit, async (req, res, next) => {
		try {
			const requestedLimit = Number(req.query.limit || 5);
			const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 && requestedLimit <= 10 ? requestedLimit : 5;
			res.json(await generateTaskAdvisorAdvice(await fetchTasks(), limit));
		} catch (error) { next(error); }
	});

	router.post('/ai/commands/preview', async (req, res, next) => {
		try {
			const commands = getAiCommandsFromBody(req.body);
			const prepared = buildAiCommandsPreview(commands, await fetchTasks());
			res.json({
				mode: 'preview',
				commandCount: prepared.length,
				commands: prepared
			});
		} catch (error) { next(error); }
	});

	router.post('/ai/advisor/request', aiRateLimit, async (req, res, next) => {
		try {
			const startedAt = Date.now();
			const action = normalizeString(req.body.action);
			const requestedDefaultCalendarId = normalizeString(req.body.defaultCalendarId);
			(req as any).log?.('info', 'advisor.request.started', {
				metadata: { action, requestedDefaultCalendarId }
			});
			if (!resolveAdvisorAction(action)) {
				throw createValidationError([`action must be one of: ${Object.keys(ADVISOR_ACTIONS).join(', ')}`]);
			}

			const [tasks, tags, memoryRules, calendars] = await Promise.all([
				fetchTasks(),
				fetchTags(''),
				fetchAdvisorMemoryRules(),
				action === 'schedule_calendar_events'
					? fetchWritableAdvisorCalendars({ pool, fetchGoogleConnection, saveGoogleConnection })
					: Promise.resolve([])
			]);
			const memory = buildAdvisorMemoryContext(memoryRules);

			if (action === 'schedule_calendar_events')
				return await ProcessCreateEventsRequest(tasks, calendars, requestedDefaultCalendarId, req.body.schedulerConstraints, normalizeString(req.body.scheduleStartFrom), {
					pool,
					fetchGoogleConnection,
					saveGoogleConnection,
					fetchTaskCalendarEvents,
					fetchCommittedSchedulerReservedBlocks,
					fetchActiveSchedulerRules,
					fetchPeriodicTasks
				}, res);

			const advisor = await generateTaskAdvisorCommands({
				action,
				tasks,
				tags,
				memory,
				calendars
			});
			const advisorCommands = filterPastCalendarCommands(
				applyDefaultCalendarToCommands(advisor.commands, calendars, requestedDefaultCalendarId)
			);
			const prepared = buildAiCommandsPreview(advisorCommands, tasks);
			const actionFiltered = filterAdvisorCommandPairsByAction({
				action,
				commands: advisorCommands,
				previews: prepared
			});
			const calendarFiltered = filterCalendarCommandsByKnownCalendars({
				commands: actionFiltered.commands,
				previews: actionFiltered.previews,
				calendars
			});
			const duplicateFiltered = filterDuplicateCalendarCommandPairs({
				commands: calendarFiltered.commands,
				previews: calendarFiltered.previews
			});
			const existingGoogleFiltered = action === 'schedule_calendar_events'
				? await filterExistingGoogleCalendarCommandPairs({
					commands: duplicateFiltered.commands,
					previews: duplicateFiltered.previews,
					dependencies: { pool, fetchGoogleConnection, saveGoogleConnection, fetchTaskCalendarEvents }
				})
				: duplicateFiltered;
			const filtered = filterAdvisorCommandPairsByMemory({
				commands: existingGoogleFiltered.commands,
				previews: existingGoogleFiltered.previews,
				memory,
				action
			});

			res.json({
				mode: 'advisor_preview',
				generatedAt: advisor.generatedAt,
				source: advisor.source,
				model: advisor.model,
				summary: advisor.summary,
				commandCount: filtered.previews.length,
				commands: addCalendarLabelsToPreviews(filtered.previews, calendars),
				rawCommands: filtered.commands
			});
			(req as any).log?.('info', 'advisor.preview.generated', {
				durationMs: Date.now() - startedAt,
				metadata: {
					action,
					taskCount: tasks.length,
					generatedCount: advisor.commands.length,
					commandCount: filtered.previews.length
				}
			});
		} catch (error) { next(error); }
	});

	router.post('/ai/advisor/schedule-explanation', async (req, res, next) => {
		try {
			const startedAt = Date.now();
			const commands = getAiCommandsFromBody({ commands: req.body.commands || [] })
				.filter((command) => command.type === 'create_calendar_event');
			const schedulerDebug = req.body.schedulerDebug && typeof req.body.schedulerDebug === 'object' ? req.body.schedulerDebug : null;
			if (!schedulerDebug) throw createValidationError(['schedulerDebug is required']);
			(req as any).log?.('info', 'advisor.schedule_explanation.started', {
				metadata: { commandCount: commands.length }
			});
			const explained = await explainScheduleCommandsWithOpenAi(scheduleExplanationInputFromDebug(commands, schedulerDebug));
			res.json({
				model: explained.model,
				summary: explained.summary,
				commands: explained.commands.map((command) => ({ id: command.id, reason: command.reason }))
			});
			(req as any).log?.('info', 'advisor.schedule_explanation.completed', {
				durationMs: Date.now() - startedAt,
				metadata: { commandCount: commands.length }
			});
		} catch (error) { next(error); }
	});
	router.post('/ai/advisor/feedback', async (req, res, next) => {
		try {
			const action = normalizeString(req.body.action);
			if (!resolveAdvisorAction(action)) {
				throw createValidationError([`action must be one of: ${Object.keys(ADVISOR_ACTIONS).join(', ')}`]);
			}
			const commandPreview = req.body.commandPreview && typeof req.body.commandPreview === 'object' ? req.body.commandPreview : null;
			if (!commandPreview?.id || !commandPreview?.type) {
				throw createValidationError(['commandPreview with id and type is required']);
			}
			const feedback = sanitizeAdvisorFeedback(action, req.body.feedback || {});
			const fallbackMemoryRule = inferAdvisorMemoryRule({ action, commandPreview, feedback });
			const [tasks, existingMemoryRules] = await Promise.all([
				fetchTasks(),
				fetchAdvisorMemoryRules()
			]);
			const sourceTask = tasks.find((task) => String(task.id) === String(commandPreview.taskId || '')) || {};
			let memoryRule = fallbackMemoryRule;
			try {
				memoryRule = await interpretAdvisorFeedbackRule({
					action,
					commandPreview,
					rawCommand: req.body.rawCommand || null,
					feedback,
					sourceTask,
					existingRules: existingMemoryRules,
					fallbackRule: fallbackMemoryRule
				});
			} catch (error: any) {
				logger.warn('advisor.feedback_rule.openai.failed', { metadata: { action, message: error.message } });
				memoryRule = mergeInterpretedRule({
					fallbackRule: fallbackMemoryRule,
					interpretedRule: { source: 'backend_feedback_fallback', confidence: 0 },
					commandPreview,
					sourceTask
				});
			}
			const taskTitle = advisorPreviewTitle(commandPreview) || null;
			const result = await withTransaction(async (client) => {
				await saveAdvisorFeedback(client, {
					action,
					commandId: commandPreview.id,
					commandType: commandPreview.type,
					taskId: commandPreview.taskId || null,
					taskTitle,
					titleFingerprint: memoryRule.titleFingerprint || titleFingerprint(taskTitle || ''),
					feedback,
					commandPreview,
					rawCommand: req.body.rawCommand || null
				});
				return upsertAdvisorMemoryRule(client, memoryRule);
			});
			res.status(201).json({ memoryRule: result });
		} catch (error) { next(error); }
	});

	function updateTasksAfterCommand(tasks, commandResult) {
		if (!commandResult?.task) return tasks;
		return tasks.some((task) => task.id === commandResult.task.id)
			? tasks.map((task) => task.id === commandResult.task.id ? commandResult.task : task)
			: [...tasks, commandResult.task];
	}

	router.post('/ai/advisor/interaction-feedback', async (req, res, next) => {
		try {
			const action = normalizeString(req.body.action);
			if (!resolveAdvisorAction(action)) {
				throw createValidationError([`action must be one of: ${Object.keys(ADVISOR_ACTIONS).join(', ')}`]);
			}
			const interaction = req.body.interaction && typeof req.body.interaction === 'object' ? req.body.interaction : {};
			const feedback = sanitizeAdvisorFeedback(action, req.body.feedback || {});
			const memoryRule = inferAdvisorInteractionMemoryRule({ action, interaction, feedback });
			const result = await withTransaction(async (client) => {
				await saveAdvisorFeedback(client, {
					action,
					commandId: `interaction:${String(interaction.generatedAt || Date.now())}`,
					commandType: 'interaction',
					taskId: null,
					taskTitle: null,
					titleFingerprint: '',
					feedback,
					commandPreview: {
						type: 'interaction',
						summary: interaction.summary || '',
						commandCount: Number(interaction.commandCount || 0),
						generatedAt: interaction.generatedAt || null
					},
					rawCommand: null
				});
				return upsertAdvisorMemoryRule(client, memoryRule);
			});
			res.status(201).json({ memoryRule: result });
		} catch (error) { next(error); }
	});

	router.get('/ai/advisor/memory', async (req, res, next) => {
		try {
			res.json(await fetchAdvisorMemoryRules());
		} catch (error) { next(error); }
	});

	router.delete('/ai/advisor/memory/:id', async (req, res, next) => {
		try {
			const deleted = await deleteAdvisorMemoryRule(undefined, req.params.id);
			if (!deleted) return res.status(404).json({ error: 'Memory rule not found' });
			return res.status(204).end();
		} catch (error) { return next(error); }
	});

	router.post('/ai/commands/apply', async (req, res, next) => {
		try {
			const startedAt = Date.now();
			const commands = getAiCommandsFromBody(req.body);
			(req as any).log?.('info', 'advisor.command.apply.started', {
				metadata: { commandCount: commands.length, commandTypes: commands.map((command) => command.type) }
			});
			const result = await withTransaction(async (client) => {
				const applied = [];
				const calendarApplyCache = {
					calendarClient: null,
					existingByFingerprint: new Map(),
					linkedEventsByTaskId: new Map()
				};
				let tasks = await fetchTasks(client);
				for (const [index, command] of commands.entries()) {
					const prepared = prepareAiCommand(command, tasks, index);
					const now = new Date().toISOString();
					const commandResult = await applyPreparedAiCommand(client, prepared, tasks, now, {
						updateTaskRecord,
						insertActivity,
						insertTask,
						findTaskById,
						pool,
						fetchGoogleConnection,
						saveGoogleConnection,
						fetchTaskCalendarEvents,
						insertTaskCalendarEvent,
						createProductivityEvent,
						createPeriodicTaskOccurrence,
						calendarApplyCache
					});
					applied.push(commandResult);
					tasks = updateTasksAfterCommand(tasks, commandResult);
					if (!commandResult.task && prepared.type !== 'create_calendar_event') tasks = await fetchTasks(client);
				}
				// Breaks are now created as explicit Google Calendar events, not hidden local reservations.
				return applied;
			});
			res.json({
				mode: 'apply',
				appliedCount: result.length,
				results: result
			});
			(req as any).log?.('info', 'advisor.command.apply.completed', {
				durationMs: Date.now() - startedAt,
				metadata: { appliedCount: result.length }
			});
		} catch (error) { next(error); }
	});
	return router;
}

module.exports = { createAdvisorRouter };

export { };
async function ProcessCreateEventsRequest(tasks: any, calendars: any, requestedDefaultCalendarId: any, schedulerConstraints: any, scheduleStartFrom: any, dependencies: any, res: any) {
	const scheduled = await scheduleCalendarCommandsWithMicroservice({
		tasks,
		calendars,
		requestedDefaultCalendarId,
		constraints: schedulerConstraints,
		scheduleStartFrom,
		dependencies
	});
	const previews = buildAiCommandsPreview(scheduled.commands, tasks);

	const labeledPreviews = addCalendarLabelsToPreviews(previews, calendars);

	return res.json({
		mode: 'advisor_preview',
		generatedAt: new Date().toISOString(),
		source: 'scheduler',
		model: scheduled.explanationModel ? 'python-scheduler + ' + scheduled.explanationModel : 'python-scheduler',
		summary: scheduled.explanationSummary || (scheduled.explanationModel ? 'Propostas agendadas pelo scheduler com explicacoes geradas por OpenAI.' : 'Propostas de eventos geradas pelo scheduler para validacao.'),
		commandCount: labeledPreviews.length,
		commands: labeledPreviews,
		rawCommands: scheduled.commands,
		reservedBlocks: scheduled.reservedBlocks || [],
		debug: scheduled.debug
	});
}



