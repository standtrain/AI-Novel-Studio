exports.up = function (knex) {
  return knex.schema.createTable('user_groups', (t) => {
    t.increments('id').primary();
    t.string('name', 50).notNullable().unique().comment('分组名称：default/vip/admin');
    t.integer('token_limit_per_day').unsigned().notNullable().defaultTo(5000).comment('每日token上限');
    t.integer('rate_limit_per_minute').unsigned().notNullable().defaultTo(5).comment('每分钟请求数限制');
    t.integer('max_novels').unsigned().notNullable().defaultTo(3).comment('可创建小说数上限');
    t.integer('max_chapters_per_novel').unsigned().notNullable().defaultTo(12).comment('单小说章节上限');
    t.boolean('can_export').notNullable().defaultTo(false).comment('是否可导出');
    t.boolean('can_customize').notNullable().defaultTo(false).comment('是否可自定义参数');
    t.string('description', 255).comment('分组描述');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('user_groups');
};
