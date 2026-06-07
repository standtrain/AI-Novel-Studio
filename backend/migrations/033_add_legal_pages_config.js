const { LEGAL_DOCUMENTS } = require('../src/constants/legalDefaults');

exports.up = async function (knex) {
  for (const doc of Object.values(LEGAL_DOCUMENTS)) {
    const existing = await knex('site_config').where('config_key', doc.key).first();
    if (existing) {
      await knex('site_config').where('config_key', doc.key).update({
        description: `${doc.title}页面正文`,
        updated_at: knex.fn.now(),
      });
    } else {
      await knex('site_config').insert({
        config_key: doc.key,
        config_value: doc.defaultContent,
        description: `${doc.title}页面正文`,
      });
    }
  }
};

exports.down = async function () {
  // 不回滚用户已编辑的协议内容，避免误删线上配置。
};
