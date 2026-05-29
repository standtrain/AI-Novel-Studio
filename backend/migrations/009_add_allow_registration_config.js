// 添加 allow_registration 配置项
exports.up = async function (knex) {
  const existing = await knex('site_config').where('config_key', 'allow_registration').first();
  if (!existing) {
    await knex('site_config').insert({
      config_key: 'allow_registration',
      config_value: 'true',
      description: '是否允许新用户注册（true/false）',
    });
  }
};

exports.down = async function (knex) {
  await knex('site_config').where('config_key', 'allow_registration').del();
};
