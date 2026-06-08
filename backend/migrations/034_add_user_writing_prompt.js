// 用户个人全局写作提示词：避免高级设置中的提示词在不同用户之间串线。
exports.up = async function (knex) {
  const exists = await knex.schema.hasColumn('users', 'user_writing_prompt');
  if (exists) return;
  return knex.schema.alterTable('users', (t) => {
    t.text('user_writing_prompt').nullable()
      .comment('用户个人全局写作提示词；NULL=使用系统默认，空字符串=关闭提示词');
  });
};

exports.down = async function (knex) {
  const exists = await knex.schema.hasColumn('users', 'user_writing_prompt');
  if (!exists) return;
  return knex.schema.alterTable('users', (t) => {
    t.dropColumn('user_writing_prompt');
  });
};
