// 用户封禁记录表和申诉表
exports.up = function (knex) {
  return knex.schema
    .createTable('user_bans', (t) => {
      t.increments('id').primary();
      t.integer('user_id').unsigned().notNullable().comment('被禁用户');
      t.enu('type', ['ban', 'deactivate']).notNullable().defaultTo('ban').comment('禁用类型');
      t.text('reason').comment('封禁/注销原因（可留空）');
      t.integer('operator_id').unsigned().comment('操作人ID');
      t.enu('status', ['active', 'lifted']).notNullable().defaultTo('active').comment('状态');
      t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
      t.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
      t.foreign('operator_id').references('id').inTable('users').onDelete('SET NULL');
    })
    .createTable('user_appeals', (t) => {
      t.increments('id').primary();
      t.integer('ban_id').unsigned().notNullable().comment('关联封禁记录');
      t.integer('user_id').unsigned().notNullable().comment('申诉用户');
      t.text('content').notNullable().comment('申诉内容');
      t.enu('status', ['pending', 'approved', 'rejected']).notNullable().defaultTo('pending').comment('审核状态');
      t.integer('reviewed_by').unsigned().comment('审核管理员ID');
      t.text('review_note').comment('审核备注');
      t.json('ai_result').comment('AI审核结果JSON');
      t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
      t.foreign('ban_id').references('id').inTable('user_bans').onDelete('CASCADE');
      t.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
      t.foreign('reviewed_by').references('id').inTable('users').onDelete('SET NULL');
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('user_appeals')
    .dropTableIfExists('user_bans');
};
