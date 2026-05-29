// 模型每日/每月 Token 限额配置表
exports.up = function (knex) {
  return knex.schema.createTable('model_token_limits', (t) => {
    t.increments('id').primary();
    t.string('provider_name', 100).notNullable().comment('Provider名称');
    t.string('model_name', 255).notNullable().comment('模型名称');
    t.integer('daily_limit').unsigned().notNullable().defaultTo(0).comment('每日token上限(0=不限制)');
    t.integer('monthly_limit').unsigned().notNullable().defaultTo(0).comment('每月token上限(0=不限制)');
    t.integer('daily_used').unsigned().notNullable().defaultTo(0).comment('今日已用token');
    t.integer('monthly_used').unsigned().notNullable().defaultTo(0).comment('本月已用token');
    t.timestamp('last_daily_reset_at').nullable().comment('上次日重置时间');
    t.timestamp('last_monthly_reset_at').nullable().comment('上次月重置时间');
    t.boolean('enabled').notNullable().defaultTo(true).comment('是否启用该限额');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    t.unique(['provider_name', 'model_name'], 'uk_provider_model');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('model_token_limits');
};
