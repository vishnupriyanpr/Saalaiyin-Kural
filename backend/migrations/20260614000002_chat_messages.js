/**
 * chat_messages — per-user chatbot conversation history.
 * Persisted in Postgres; recent turns are also cached in Redis (key chat:<session_id>).
 */
exports.up = function (knex) {
  return knex.schema.createTable('chat_messages', (t) => {
    t.increments('id').primary();
    t.integer('user_id').notNullable();
    t.string('session_id').notNullable();
    t.string('role').notNullable();          // 'user' | 'assistant'
    t.text('content').notNullable();
    t.string('category');                     // optional category from the bot
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    t.index(['user_id', 'session_id', 'created_at']);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('chat_messages');
};
