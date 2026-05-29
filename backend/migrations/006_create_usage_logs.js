exports.up = function (knex) {
  return knex.schema.createTable('usage_logs', (t) => {
    t.bigIncrements('id').primary();
    t.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE').comment('用户');
    t.integer('novel_id').unsigned().nullable().references('id').inTable('novels').onDelete('SET NULL').comment('关联小说');
    t.string('request_type', 50).notNullable().comment('请求类型：outline/characters/chapter_outline/write_chapter');
    t.integer('tokens_used').unsigned().notNullable().defaultTo(0).comment('消耗token总数');
    t.integer('prompt_tokens').unsigned().nullable().defaultTo(0).comment('提示词token');
    t.integer('completion_tokens').unsigned().nullable().defaultTo(0).comment('生成token');
    t.string('model', 50).nullable().comment('使用的模型');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['user_id', 'created_at'], 'idx_usage_user_date');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('usage_logs');
};
