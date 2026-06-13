// 邮件发送速率限制表：跨进程共享 60 秒冷却 + 每日上限
// 用于替换原有内存 Map 实现，避免 PM2 cluster 模式下各进程独立计数被绕过
exports.up = function (knex) {
  return knex.schema.createTable('email_send_throttle', (t) => {
    t.increments('id').primary();
    t.string('email', 120).notNullable().comment('目标邮箱（小写）');
    t.string('type', 30).notNullable().comment('类型：register / reset_password / change_email / login / notification');
    t.timestamp('last_sent_at').notNullable().defaultTo(knex.fn.now()).comment('最近一次发送时间，用于冷却判定');
    t.string('day_bucket', 10).notNullable().comment('日期桶 YYYY-MM-DD，用于按日累计');
    t.integer('day_count').unsigned().notNullable().defaultTo(0).comment('当日累计发送次数');
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    t.unique(['email', 'type']);
    t.index(['day_bucket']);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('email_send_throttle');
};
