module.exports = {
	...require('./advisorMemoryMapper'),
	...require('./googleMapper'),
	...require('./periodicTaskMapper'),
	...require('./productivityMapper'),
	...require('./quickQueueMapper'),
	...require('./schedulerMapper'),
	...require('./sharedNoteMapper')
};

export {};
