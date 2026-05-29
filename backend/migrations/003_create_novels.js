exports.up = function (knex) {
  return knex.schema.createTable('novels', (t) => {
    t.increments('id').primary();
    t.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE').comment('所属用户');
    t.string('title', 200).notNullable().comment('小说标题');
    t.string('genre', 100).comment('小说类型');
    t.string('theme', 255).comment('核心主题');
    t.text('setting').comment('世界观/背景设定');
    t.text('main_plot').comment('主线剧情概述');
    t.json('sub_plots').comment('支线剧情数组');
    t.enu('status', ['draft', 'outline', 'characters', 'chapters_outline', 'writing', 'completed'])
      .notNullable().defaultTo('draft').comment('创作状态');
    t.integer('current_step').unsigned().notNullable().defaultTo(0).comment('当前阶段 0-4');
    t.integer('chapter_count').unsigned().nullable().comment('总章数');
    t.json('context_data').nullable().comment('ContextManager序列化状态');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('novels');
};
