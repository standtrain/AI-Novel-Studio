exports.up = function (knex) {
  return knex.schema.createTable('users', (t) => {
    t.increments('id').primary();
    t.string('username', 50).notNullable().unique().comment('用户名');
    t.string('email', 120).notNullable().unique().comment('邮箱');
    t.string('password_hash', 255).notNullable().comment('bcrypt密码哈希');
    t.integer('group_id').unsigned().notNullable().defaultTo(1).references('id').inTable('user_groups').comment('所属用户组');
    t.enu('status', ['active', 'disabled']).notNullable().defaultTo('active').comment('账号状态');
    t.integer('daily_tokens_used').unsigned().notNullable().defaultTo(0).comment('今日已用token');
    t.timestamp('last_token_reset_at').nullable().comment('上次token重置时间');
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('users');
};
