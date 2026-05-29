// 添加 chapters_per_batch 配置项，更新 max_tokens_per_request 默认值
exports.up = async function (knex) {
  // 如果已存在则跳过
  const existing = await knex('site_config').where('config_key', 'chapters_per_batch').first();
  if (!existing) {
    await knex('site_config').insert({
      config_key: 'chapters_per_batch',
      config_value: '20',
      description: '章节大纲每批生成章节数',
    });
  }

  // 更新 max_tokens_per_request 默认值（0 = 不限制）
  const mtpr = await knex('site_config').where('config_key', 'max_tokens_per_request').first();
  if (mtpr) {
    await knex('site_config').where('config_key', 'max_tokens_per_request').update({
      description: '单次请求最大token数（0=不限制）',
    });
  }
};

exports.down = async function (knex) {
  await knex('site_config').where('config_key', 'chapters_per_batch').del();
};
