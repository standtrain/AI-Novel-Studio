// 邮箱验证码失败计数表：用于限制暴力破解
// 同一邮箱+类型在 10 分钟内失败超过 5 次则锁定，过期自动清理
exports.up = function (knex) {
  return knex.schema.createTable('email_verification_failures', (t) => {
    t.increments('id').primary();
    t.string('email', 120).notNullable().comment('目标邮箱');
    t.string('type', 30).notNullable().comment('类型：register / reset_password / change_email / login');
    t.integer('fail_count').unsigned().notNullable().defaultTo(0).comment('当前窗口内失败次数');
    t.timestamp('window_started_at').notNullable().defaultTo(knex.fn.now()).comment('当前计数窗口起始时间');
    t.timestamp('locked_until').nullable().comment('锁定截止时间，null 表示未锁定');
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    t.unique(['email', 'type']);
    t.index(['locked_until']);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('email_verification_failures');
};
