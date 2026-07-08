const express = require('express');
const { ADVISOR_ACTIONS, generateTaskAdvisorAdvice, generateTaskAdvisorCommands, resolveAdvisorAction } = require('../ai/aiAdvisor');
const { createCalendarClient, createOAuthClient } = require('../google/googleClient');
const { decryptJson } = require('../google/tokenCrypto');
const { requestSchedule } = require('../ai/schedulerClient');
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
	sanitizeAdvisorFeedback,
	titleFingerprint
} = require('../ai/advisorMemory');

const aiRateLimit = createMemoryRateLimit({
	windowMs: Number(process.env.AI_RATE_LIMIT_WINDOW_MS || 10000),
	max: Number(process.env.AI_RATE_LIMIT_MAX || 3),
	message: 'AI request rate limit exceeded'
});

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
			if (linkedEvents.length) return null;
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

function schedulerConstraintMap(constraints: any[] = []) {
	return new Map((Array.isArray(constraints) ? constraints : [])
		.filter((item) => item?.taskId && item.start)
		.map((item) => [String(item.taskId), {
			fixedStart: normalizeString(item.start),
			fixedEnd: normalizeString(item.end)
		}]));
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

async function scheduleCalendarCommandsWithMicroservice({ tasks, calendars, requestedDefaultCalendarId, constraints, dependencies }: any) {
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
		.filter(({ task, linkedEvents }) => isEligibleCalendarTask(task) && !linkedEvents.length)
		.map(({ task }) => task);
	const now = new Date().toISOString();
	const horizonEnd = scheduleHorizon(eligibleTasks, fixedConstraints, new Date(now));
	const busy = await fetchAdvisorBusyEvents({
		...dependencies,
		calendarId,
		calendarIds: calendars.map((calendar) => calendar.id),
		timeMin: now,
		timeMax: horizonEnd
	});
	const scheduled = await requestSchedule({
		now,
		horizonEnd,
		timeZone: calendarTimeZone,
		busy,
		constraints: [...fixedConstraints.entries()].map(([taskId, constraint]) => ({
			taskId,
			fixedStart: constraint.fixedStart,
			fixedEnd: constraint.fixedEnd || null
		})),
		tasks: eligibleTasks.map((task) => ({
			id: task.id,
			title: task.title || '',
			durationMinutes: taskDurationMinutes(task),
			dueDateTime: task.dueDateTime || null,
			...(fixedConstraints.get(String(task.id)) || {})
		}))
	});
	const tasksById = new Map(eligibleTasks.map((task) => [String(task.id), task]));
	const commands = scheduled.scheduled.map((item) => {
		const task = tasksById.get(String(item.taskId));
		const fixed = fixedConstraints.has(String(item.taskId));
		return {
			id: `schedule_${item.taskId}`,
			type: 'create_calendar_event',
			taskId: item.taskId,
			reason: fixed ? 'Horario ajustado pelo utilizador e reagendado pelo OR-Tools.' : 'Horario escolhido pelo OR-Tools no proximo slot livre.',
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
	return {
		commands,
		debug: {
			generatedCount: eligibleTasks.length,
			afterActionFilter: commands.length,
			afterCalendarFilter: commands.length,
			afterPastFilter: commands.length,
			afterDuplicateBatchFilter: commands.length,
			afterExistingGoogleFilter: commands.length,
			afterMemoryFilter: commands.length,
			candidateTaskCount: eligibleTasks.length,
			candidateTasksWithDueDate: eligibleTasks.filter((task) => task.dueDateTime).length,
			candidateTasksWithoutDueDate: eligibleTasks.filter((task) => !task.dueDateTime).length,
			rejectedCount: scheduled.unscheduled.length,
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
	deleteAdvisorMemoryRule,
	fetchTaskCalendarEvents,
	insertTaskCalendarEvent
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
				return await ProcessCreateEventsRequest(tasks, calendars, requestedDefaultCalendarId, req.body.schedulerConstraints, pool, fetchGoogleConnection, saveGoogleConnection, fetchTaskCalendarEvents, res);

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
			const memoryRule = inferAdvisorMemoryRule({ action, commandPreview, feedback });
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
						insertTaskCalendarEvent
					});
					applied.push(commandResult);
					tasks = await fetchTasks(client);
				}
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
async function ProcessCreateEventsRequest(tasks: any, calendars: any, requestedDefaultCalendarId: any, schedulerConstraints: any, pool: any, fetchGoogleConnection: any, saveGoogleConnection: any, fetchTaskCalendarEvents: any, res: any) {
	const scheduled = await scheduleCalendarCommandsWithMicroservice({
		tasks,
		calendars,
		requestedDefaultCalendarId,
		constraints: schedulerConstraints,
		dependencies: { pool, fetchGoogleConnection, saveGoogleConnection, fetchTaskCalendarEvents }
	});
	const previews = buildAiCommandsPreview(scheduled.commands, tasks);

	const labeledPreviews = addCalendarLabelsToPreviews(previews, calendars);

	return res.json({
		mode: 'advisor_preview',
		generatedAt: new Date().toISOString(),
		source: 'scheduler',
		model: 'python-ortools',
		summary: 'Propostas de eventos geradas pelo OR-Tools para validacao.',
		commandCount: labeledPreviews.length,
		commands: labeledPreviews,
		rawCommands: scheduled.commands,
		debug: scheduled.debug
	});
}
