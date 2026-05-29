// 小说模板表，供模板商店和模板创建功能使用
exports.up = function (knex) {
  return knex.schema.createTable('novel_templates', (t) => {
    t.increments('id').primary();
    t.string('name', 100).notNullable().unique().comment('模板标识名');
    t.string('display_name', 200).notNullable().comment('模板显示名称');
    t.text('description').notNullable().comment('模板描述');
    t.string('category', 50).notNullable().defaultTo('其他').comment('分类：玄幻/都市/科幻/悬疑/历史/游戏/轻小说/其他');
    t.string('cover_gradient', 100).defaultTo('linear-gradient(135deg, #667eea 0%, #764ba2 100%)').comment('卡片渐变背景色');
    t.string('icon', 50).defaultTo('BookOutlined').comment('Ant Design 图标名');
    t.string('genre', 100).nullable().comment('默认小说类型');
    t.string('title_example', 200).nullable().comment('示例标题');
    t.text('theme').nullable().comment('预设核心主题');
    t.text('setting').nullable().comment('预设世界观/背景设定');
    t.text('main_plot').nullable().comment('预设主线剧情概述');
    t.boolean('is_official').notNullable().defaultTo(true).comment('是否官方模板');
    t.integer('sort_order').notNullable().defaultTo(0).comment('排序权重');
    t.boolean('enabled').notNullable().defaultTo(true).comment('启用状态');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('novel_templates');
};
