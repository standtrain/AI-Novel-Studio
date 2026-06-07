exports.up = async function (knex) {
  const existing = await knex('site_config')
    .where('config_key', 'agent_max_concurrent_tasks')
    .first();

  if (!existing) {
    await knex('site_config').insert({
      config_key: 'agent_max_concurrent_tasks',
      config_value: '5',
      description: 'AI任务全局并发上限（0=不限制）',
    });
  } else {
    await knex('site_config')
      .where('config_key', 'agent_max_concurrent_tasks')
      .update({
        description: 'AI任务全局并发上限（0=不限制）',
        updated_at: knex.fn.now(),
      });
  }
};

exports.down = async function (knex) {
  await knex('site_config')
    .where('config_key', 'agent_max_concurrent_tasks')
    .del();
};
