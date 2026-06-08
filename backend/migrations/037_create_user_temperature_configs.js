exports.up = function (knex) {
  return knex.schema.createTable('user_temperature_configs', (t) => {
    t.increments('id').primary();
    t.integer('user_id').unsigned().notNullable().comment('用户 ID');
    t.string('phase', 50).notNullable().comment('生成阶段');
    t.decimal('temperature', 3, 2).notNullable().comment('用户覆盖温度，范围 0-2');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    t.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    t.unique(['user_id', 'phase']);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('user_temperature_configs');
};
