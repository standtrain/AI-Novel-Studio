// 通知功能扩展：新增站内信和邮箱通知渠道
exports.up = async function (knex) {
  // 1. notifications 表新增两个展示渠道字段
  await knex.schema.alterTable('notifications', (t) => {
    t.boolean('show_inmail').notNullable().defaultTo(false).comment('站内信发送');
    t.boolean('show_email').notNullable().defaultTo(false).comment('邮件发送');
  });

  // 2. 创建站内信表
  await knex.schema.createTable('inmails', (t) => {
    t.increments('id').unsigned().primary();
    t.integer('user_id').unsigned().notNullable().comment('接收用户ID');
    t.integer('notification_id').unsigned().nullable().comment('关联通知ID，可为空');
    t.string('title', 255).notNullable().comment('标题');
    t.text('content').notNullable().comment('内容');
    t.boolean('is_read').notNullable().defaultTo(false).comment('是否已读');
    t.timestamp('read_at').nullable().comment('阅读时间');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index('user_id');
    t.index('is_read');
    t.index('created_at');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('inmails');
  await knex.schema.alterTable('notifications', (t) => {
    t.dropColumn('show_email');
    t.dropColumn('show_inmail');
  });
};
