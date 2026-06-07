// 新增默认注册分组配置，兼容已经部署过的旧数据库。
exports.up = async function (knex) {
  const existing = await knex('site_config').where('config_key', 'default_group').first();
  if (!existing) {
    await knex('site_config').insert({
      config_key: 'default_group',
      config_value: '1',
      description: '新用户注册时的默认分组ID',
    });
  }
};

exports.down = async function (knex) {
  // 保留配置，避免回滚时误删管理员已经设置过的默认分组。
};
