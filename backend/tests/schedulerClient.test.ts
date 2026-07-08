const test = require('node:test');
const assert = require('node:assert/strict');
const { requestSchedule } = require('../ai/schedulerClient');

test('requestSchedule posts to the scheduler service and returns scheduled data', async () => {
  const previousFetch = global.fetch;
  process.env.SCHEDULER_SERVICE_URL = 'http://scheduler.test';
  global.fetch = (async (url: string, options: any) => {
    assert.equal(url, 'http://scheduler.test/schedule');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body).tasks[0].id, 'task-1');
    return {
      ok: true,
      status: 200,
      json: async () => ({
        scheduled: [{ taskId: 'task-1', start: '2026-07-08T08:00:00Z', end: '2026-07-08T08:30:00Z' }],
        unscheduled: []
      })
    } as Response;
  }) as typeof fetch;

  try {
    const result = await requestSchedule({
      now: '2026-07-08T08:00:00Z',
      horizonEnd: '2026-07-09T22:00:00Z',
      busy: [],
      tasks: [{ id: 'task-1', title: 'Task', durationMinutes: 30 }]
    });

    assert.equal(result.scheduled[0].taskId, 'task-1');
    assert.equal(result.unscheduled.length, 0);
  } finally {
    global.fetch = previousFetch;
    delete process.env.SCHEDULER_SERVICE_URL;
  }
});
