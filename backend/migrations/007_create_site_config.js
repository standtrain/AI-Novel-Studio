exports.up = function (knex) {
  return knex.schema.createTable('site_config', (t) => {
    t.increments('id').primary();
    t.string('config_key', 100).notNullable().unique().comment('配置键名');
    t.text('config_value').notNullable().comment('配置值');
    t.string('description', 255).nullable().comment('配置说明');
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('site_config');
};
