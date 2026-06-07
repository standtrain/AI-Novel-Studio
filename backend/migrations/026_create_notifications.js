// 系统通知表：管理员可发布通知，支持弹窗和滚动条两种展示方式
exports.up = function (knex) {
  return knex.schema.createTable('notifications', (t) => {
    t.increments('id').unsigned().primary();
    t.string('title', 255).notNullable().comment('通知标题');
    t.text('content').notNullable().comment('通知正文');
    t.boolean('show_popup').notNullable().defaultTo(false).comment('登录后弹窗展示');
    t.boolean('show_banner').notNullable().defaultTo(false).comment('首页滚动通知栏展示');
    t.boolean('enabled').notNullable().defaultTo(true).comment('是否启用');
    t.integer('sort_order').notNullable().defaultTo(0).comment('排序权重，越大越靠前');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.timestamp('updated_at').defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('notifications');
};
