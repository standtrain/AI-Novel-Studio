exports.seed = async function (knex) {
  // 先清空（按依赖顺序）
  await knex('usage_logs').del();
  await knex('chapters').del();
  await knex('characters').del();
  await knex('novels').del();
  await knex('users').del();
  await knex('user_groups').del();
  await knex('site_config').del();

  // 插入用户分组
  await knex('user_groups').insert([
    {
      id: 1,
      name: 'free',
      token_limit_per_day: 5000,
      rate_limit_per_minute: 3,
      max_novels: 3,
      max_chapters_per_novel: 10,
      can_export: false,
      can_customize: false,
      can_choose_model: false,
      description: '免费用户',
    },
    {
      id: 2,
      name: 'vip',
      token_limit_per_day: 50000,
      rate_limit_per_minute: 10,
      max_novels: 10,
      max_chapters_per_novel: 30,
      can_export: true,
      can_customize: true,
      can_choose_model: true,
      description: 'VIP用户',
    },
    {
      id: 3,
      name: 'admin',
      token_limit_per_day: 999999,
      rate_limit_per_minute: 60,
      max_novels: 999,
      max_chapters_per_novel: 999,
      can_export: true,
      can_customize: true,
      can_choose_model: true,
      description: '管理员',
    },
  ]);
};
