const { DEFAULT_TEMPERATURE_CONFIGS } = require('../src/utils/temperaturePreset');

exports.up = async function (knex) {
  for (const [config_key, cfg] of Object.entries(DEFAULT_TEMPERATURE_CONFIGS)) {
    const existing = await knex('site_config').where('config_key', config_key).first();
    if (existing) {
      await knex('site_config').where('config_key', config_key).update({
        description: cfg.description,
        updated_at: knex.fn.now(),
      });
    } else {
      await knex('site_config').insert({
        config_key,
        config_value: String(cfg.value),
        description: cfg.description,
      });
    }
  }
};

exports.down = async function () {
  // 保留配置值，避免回滚时删除管理员已经调整过的温度参数。
};
