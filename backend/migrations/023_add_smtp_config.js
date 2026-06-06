// 添加 SMTP 邮件发送配置项
exports.up = async function (knex) {
  const configs = [
    { config_key: 'email_provider', config_value: 'resend', description: '邮件发送方式：resend（Resend API）/ smtp（SMTP 服务器）' },
    { config_key: 'smtp_host', config_value: '', description: 'SMTP 主机地址' },
    { config_key: 'smtp_port', config_value: '587', description: 'SMTP 端口（常见：25/465/587）' },
    { config_key: 'smtp_secure', config_value: 'false', description: '是否使用 TLS/SSL 安全连接（true/false，端口465需开启）' },
    { config_key: 'smtp_auth_login', config_value: 'false', description: '强制使用 AUTH LOGIN 认证方式（true/false）' },
    { config_key: 'smtp_user', config_value: '', description: 'SMTP 认证用户名' },
    { config_key: 'smtp_from', config_value: '', description: '发件地址（格式：显示名称 <email@example.com> 或 email@example.com）' },
    { config_key: 'smtp_pass', config_value: '', description: 'SMTP 密码或访问令牌' },
  ];

  for (const cfg of configs) {
    const existing = await knex('site_config').where('config_key', cfg.config_key).first();
    if (!existing) {
      await knex('site_config').insert({
        config_key: cfg.config_key,
        config_value: cfg.config_value,
        description: cfg.description,
      });
    }
  }
};

exports.down = async function () {
  // 不执行回滚
};
