exports.up = function (knex) {
  return knex.schema.createTable('email_verifications', (t) => {
    t.increments('id').primary();
    t.integer('user_id').unsigned().nullable().comment('关联用户ID（注册验证时可能为空）');
    t.string('email', 120).notNullable().comment('目标邮箱');
    t.string('code', 10).notNullable().comment('6位数字验证码');
    t.string('type', 30).notNullable().comment('类型：register/ reset_password/ change_email');
    t.string('new_email', 120).nullable().comment('变更邮箱时的新邮箱地址');
    t.boolean('used').notNullable().defaultTo(false).comment('是否已使用');
    t.timestamp('expires_at').notNullable().comment('过期时间');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.index(['email', 'type', 'used']);
    t.index(['expires_at']);
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('email_verifications');
};
