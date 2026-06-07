// 为通知渠道增加发送状态，避免邮件或站内信因重复保存/重试被反复发送。
exports.up = async function (knex) {
  await knex.schema.alterTable('notifications', (t) => {
    t.timestamp('inmail_sent_at').nullable().comment('站内信批量发送时间');
    t.timestamp('email_sent_at').nullable().comment('邮件批量发送时间');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('notifications', (t) => {
    t.dropColumn('email_sent_at');
    t.dropColumn('inmail_sent_at');
  });
};
