exports.up = async function (knex) {
  await knex.schema.alterTable('users', (table) => {
    table.timestamp('last_login_at').nullable().comment('最后登录时间')
      .after('preferred_model');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('last_login_at');
  });
};
