module.exports = {
	...require('./advisorMemoryRepository'),
	...require('./googleRepository'),
	...require('./healthRepository'),
	...require('./periodicTasksRepository'),
	...require('./productivityRepository'),
	...require('./quickQueueRepository'),
	...require('./schedulerRepository'),
	...require('./sharedNotesRepository'),
	...require('./tagsRepository'),
	...require('./tasksRepository')
};

export {};
