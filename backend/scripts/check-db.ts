require('dotenv').config();
const { checkConnection, pool } = require('../db/database');
const { logInfo, logError } = require('../logger');

checkConnection()
  .then((result) => {
    logInfo({
      event: 'db.check.connected',
      entity: 'database',
      entityId: result.database
    }, `Connected to database "${result.database}"`);
  })
  .catch((error: Error) => {
    logError({
      event: 'db.check.failed',
      err: error
    }, 'Database connection failed');
    process.exitCode = 1;
  })
  .finally(() => pool.end());

export {};
