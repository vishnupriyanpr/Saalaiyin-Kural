require('dotenv').config();

/**
 * Knex configuration for Saalai Kural (PostgreSQL).
 * The same config is used for all environments since the app is single-stage.
 */
const config = {
  client: 'pg',
  connection: process.env.DATABASE_URL,
  pool: { min: 0, max: 10 },
  migrations: {
    directory: './migrations',
    tableName: 'knex_migrations',
  },
};

module.exports = {
  development: config,
  production: config,
};
