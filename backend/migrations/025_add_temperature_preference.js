// 用户创作温度偏好：用于控制生成内容的稳定/发散程度
exports.up = function (knex) {
  return knex.schema.alterTable('users', (t) => {
    t.string('temperature_preset', 20).notNullable().defaultTo('balanced')
      .comment('创作温度预设：precise/balanced/creative/wild/custom');
    t.decimal('custom_temperature', 3, 2).nullable()
      .comment('自定义创作温度，范围 0-2，仅 custom 预设生效');
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('users', (t) => {
    t.dropColumn('custom_temperature');
    t.dropColumn('temperature_preset');
  });
};
