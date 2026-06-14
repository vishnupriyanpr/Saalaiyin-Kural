/**
 * Initial Saalai Kural schema (PostgreSQL).
 * JSON columns use jsonb (auto-parsed by node-postgres on read).
 * Timestamps use timestamptz. Primary keys use increments (serial).
 */

exports.up = async function (knex) {
  await knex.schema.createTable('users', (t) => {
    t.increments('id').primary();
    t.text('role'); // civilian / admin / authority / worker
    t.text('name');
    t.text('phone').unique();
    t.text('email').unique();
    t.text('password');
    t.text('district');
    t.text('city');
    t.text('pincode');
    t.integer('points').defaultTo(0);
    t.integer('points_redeemed').defaultTo(0);
    t.text('level').defaultTo('Rookie Reporter');
    t.integer('streak_days').defaultTo(0);
    t.text('last_report_date');
    t.jsonb('badges').defaultTo('[]');
    t.text('aadhaar_hash');
    t.text('department');
    t.jsonb('jurisdiction_road_types').defaultTo('[]');
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('workers', (t) => {
    t.increments('id').primary();
    t.text('name');
    t.text('phone');
    t.jsonb('skill_tags').defaultTo('[]');
    t.text('district');
    t.text('availability').defaultTo('available');
    t.specificType('rating', 'real').defaultTo(5.0);
    t.boolean('is_civilian_worker').defaultTo(false);
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('roads', (t) => {
    t.increments('id').primary();
    t.text('name');
    t.text('type'); // NH / SH / MDR
    t.text('jurisdiction_dept');
    t.text('contractor_name');
    t.text('contractor_contact');
    t.decimal('budget_sanctioned', null).defaultTo(0);
    t.decimal('budget_spent', null).defaultTo(0);
    t.text('last_relayed_date');
    t.jsonb('maintenance_history').defaultTo('[]');
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('complaints', (t) => {
    t.increments('id').primary();
    t.integer('civilian_id');
    t.text('title');
    t.text('type');
    t.text('description');
    t.text('photo_url');
    t.jsonb('photo_metadata');
    t.specificType('lat', 'double precision');
    t.specificType('lng', 'double precision');
    t.text('address');
    t.text('district');
    t.text('severity').defaultTo('medium');
    t.jsonb('ai_classification');
    t.text('status').defaultTo('pending');
    t.integer('points_awarded').defaultTo(0);
    t.integer('worker_id');
    t.decimal('budget_estimated', null);
    t.decimal('budget_actual', null);
    t.integer('road_id');
    t.text('road_type');
    t.integer('assigned_authority_id');
    t.text('proof_image_url');
    t.text('resolution_notes');
    t.timestamp('resolved_at', { useTz: true });
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('reward_items', (t) => {
    t.increments('id').primary();
    t.text('name');
    t.text('icon');
    t.integer('points_cost');
    t.text('category');
    t.integer('stock').defaultTo(10);
    t.boolean('active').defaultTo(true);
  });

  await knex.schema.createTable('reward_redemptions', (t) => {
    t.increments('id').primary();
    t.integer('civilian_id');
    t.text('item_name');
    t.integer('points_cost');
    t.text('status').defaultTo('pending');
    t.timestamp('redeemed_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('notifications', (t) => {
    t.increments('id').primary();
    t.integer('user_id');
    t.integer('complaint_id');
    t.text('target_role').defaultTo('all');
    t.integer('target_id');
    t.text('title');
    t.text('body');
    t.text('message');
    t.text('type');
    t.boolean('read').defaultTo(false);
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('projects', (t) => {
    t.increments('id').primary();
    t.jsonb('complaint_ids').defaultTo('[]');
    t.text('title');
    t.text('district');
    t.decimal('budget_total', null).defaultTo(0);
    t.decimal('budget_spent', null).defaultTo(0);
    t.text('status').defaultTo('planning');
    t.jsonb('worker_ids').defaultTo('[]');
    t.text('start_date');
    t.text('end_date');
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('feedback', (t) => {
    t.increments('id').primary();
    t.integer('complaint_id');
    t.integer('citizen_id');
    t.integer('rating');
    t.text('comment');
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('multiplier_events', (t) => {
    t.increments('id').primary();
    t.text('district');
    t.specificType('multiplier', 'real');
    t.text('start_date');
    t.text('end_date');
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('multiplier_events');
  await knex.schema.dropTableIfExists('feedback');
  await knex.schema.dropTableIfExists('projects');
  await knex.schema.dropTableIfExists('notifications');
  await knex.schema.dropTableIfExists('reward_redemptions');
  await knex.schema.dropTableIfExists('reward_items');
  await knex.schema.dropTableIfExists('complaints');
  await knex.schema.dropTableIfExists('roads');
  await knex.schema.dropTableIfExists('workers');
  await knex.schema.dropTableIfExists('users');
};
