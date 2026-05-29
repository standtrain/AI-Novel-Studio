// 用户表增加首选模型字段（null=按管理员优先级）
exports.up = function (knex) {
  return knex.schema.alterTable('users', (t) => {
    t.string('preferred_model', 255).nullable()
      .comment('用户首选模型(null=按管理员优先级)，格式: provider_name::model_name');
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('users', (t) => {
    t.dropColumn('preferred_model');
  });
};
