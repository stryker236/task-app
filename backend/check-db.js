require('dotenv').config();
const { checkConnection, pool } = require('./database');

checkConnection()
  .then((result) => {
    console.log(`Connected to database "${result.database}" at ${new Date(result.time).toISOString()}`);
  })
  .catch((error) => {
    console.error(`Database connection failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
