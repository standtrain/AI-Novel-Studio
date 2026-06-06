// 添加邮箱每日发送上限配置项
exports.up = async function (knex) {
  const existing = await knex('site_config').where('config_key', 'email_daily_limit').first();
  if (!existing) {
    await knex('site_config').insert({
      config_key: 'email_daily_limit',
      config_value: '5',
      description: '每个邮箱每日最多可请求验证码次数（0=不限制）',
    });
  }
};

exports.down = async function () {
  // 不执行回滚
};
