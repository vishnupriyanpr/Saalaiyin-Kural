require('dotenv').config();

// Postgres returns NUMERIC/DECIMAL (and BIGINT) columns as STRINGS by default to
// avoid precision loss. Our budget columns are NUMERIC, so the UI was doing
// string concatenation (e.g. "₹0" + "150000" + "49000" → "₹015000049000").
// Parse them back to JS numbers — every value here is well within the IEEE-754
// safe-integer range. This must run before the knex/pg pool is created.
const pgTypes = require('pg').types;
pgTypes.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v))); // numeric / decimal
pgTypes.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));  // int8 / bigint

const knexConfig = require('./knexfile');
const env = process.env.NODE_ENV === 'production' ? 'production' : 'development';

// Exported configured knex instance. server.js uses this as a query builder:
//   const db = require('./db');  db('users').where(...) ...
const db = require('knex')(knexConfig[env]);

// Lightweight connectivity log on startup. Never crash the module on a failed
// connect — the app may start before Postgres is fully ready.
db.raw('select 1+1 as result')
  .then(() => {
    console.log('Connected to PostgreSQL database.');
  })
  .catch((err) => {
    console.error('PostgreSQL connectivity check failed:', err.message);
  });

module.exports = db;
