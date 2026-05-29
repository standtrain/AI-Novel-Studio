// 用户分组增加“是否允许自选模型”字段
exports.up = function (knex) {
  return knex.schema.alterTable('user_groups', (t) => {
    t.boolean('can_choose_model').notNullable().defaultTo(false)
      .comment('是否允许用户自选首选大模型');
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('user_groups', (t) => {
    t.dropColumn('can_choose_model');
  });
};
