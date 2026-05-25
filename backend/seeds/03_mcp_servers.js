exports.seed = async function (knex) {
  // 先清空用户 MCP 配置（依赖 mcp_servers）
  await knex('user_mcp_configs').del();
  await knex('mcp_servers').del();

  await knex('mcp_servers').insert([
    {
      name: 'anysearch',
      transport: 'http',
      url: 'https://api.anysearch.com/mcp',
      headers: JSON.stringify({ Authorization: 'Bearer ${ANYSEARCH_API_KEY}' }),
      enabled: 1,
      description: '统一实时搜索引擎，为AI代理提供网页、新闻、图片等搜索能力。免费API Key申请: https://anysearch.com/console/api-keys',
    },
  ]);
};
