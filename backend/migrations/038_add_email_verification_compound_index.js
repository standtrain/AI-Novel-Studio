// 为 email_verifications 表的清理与查询路径补上 (expires_at, used) 复合索引
exports.up = async function (knex) {
  await knex.schema.alterTable('email_verifications', (t) => {
    t.index(['expires_at', 'used'], 'idx_email_verifications_expires_used');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('email_verifications', (t) => {
    t.dropIndex(['expires_at', 'used'], 'idx_email_verifications_expires_used');
  });
};
