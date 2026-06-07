exports.up = function (knex) {
  // 对话表
  return knex.schema
    .createTable('chat_conversations', (t) => {
      t.increments('id').primary();
      t.integer('user_id').unsigned().notNullable()
        .references('id').inTable('users').onDelete('CASCADE')
        .comment('所属用户');
      t.string('title', 200).notNullable().comment('对话标题（取自首条消息）');
      t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
      t.index('user_id');
      t.index(['user_id', 'updated_at']);
    })
    .createTable('chat_messages', (t) => {
      t.increments('id').primary();
      t.integer('conversation_id').unsigned().notNullable()
        .references('id').inTable('chat_conversations').onDelete('CASCADE')
        .comment('所属对话');
      t.enu('role', ['user', 'assistant']).notNullable().comment('消息角色');
      t.text('content').notNullable().comment('消息内容');
      t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      t.index(['conversation_id', 'created_at']);
    });
};

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('chat_messages')
    .dropTableIfExists('chat_conversations');
};
