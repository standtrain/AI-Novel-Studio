exports.seed = async function (knex) {
  await knex('site_config').del();

  await knex('site_config').insert([
    { config_key: 'site_name', config_value: 'AI Novel Studio', description: '网站名称' },
    { config_key: 'site_description', config_value: '基于AI的小说创作平台', description: '网站描述' },
    { config_key: 'max_tokens_per_request', config_value: '0', description: '单次请求最大token数（0=不限制）' },
    { config_key: 'default_temperature', config_value: '0.7', description: '默认temperature参数' },
    { config_key: 'chapters_per_batch', config_value: '20', description: '章节大纲每批生成章节数' },
    { config_key: 'allow_registration', config_value: 'true', description: '是否允许新用户注册（true/false）' },
    // 以下为模型相关配置，在「模型管理」页面管理
    { config_key: 'openai_api_key', config_value: '', description: '单Provider API Key' },
    { config_key: 'openai_base_url', config_value: 'https://api.openai.com/v1', description: '单Provider API地址' },
    { config_key: 'default_model', config_value: 'gpt-4o', description: '单Provider默认模型' },
    { config_key: 'openai_providers', config_value: '', description: '多Provider JSON配置' },
    // 安全相关配置
    { config_key: 'captcha_enabled', config_value: 'false', description: '是否启用登录验证码（true/false）' },
    { config_key: 'cors_enabled', config_value: 'false', description: '是否启用 CORS 跨域（true/false，默认关闭）' },
    { config_key: 'cors_origins', config_value: '', description: 'CORS 域名白名单（每行一个域名）' },
    { config_key: 'login_rate_limit', config_value: '5', description: '登录接口每分钟最大尝试次数' },
    { config_key: 'mcp_api_key', config_value: '', description: 'MCP 端点的 API Key（用于外部 AI 应用连接）' },
  ]);
};
