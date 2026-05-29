// PM2 进程管理配置
module.exports = {
  apps: [
    {
      name: 'bookagent-backend',
      script: 'src/index.js',
      cwd: '/opt/bookagent/backend',
      instances: 2,
      exec_mode: 'cluster',
      max_memory_restart: '800M',
      error_file: '/opt/bookagent/backend/logs/pm2-error.log',
      out_file: '/opt/bookagent/backend/logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
