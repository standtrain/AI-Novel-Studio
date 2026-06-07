// 环境变量验证工具
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

// 检查环境变量
function checkEnvironmentVariables() {
  const required = [
    'PORT',
    'DB_HOST',
    'DB_PORT',
    'DB_USER',
    'DB_PASSWORD',
    'DB_NAME',
    'JWT_SECRET',
    'OPENAI_API_KEY',
    'OPENAI_BASE_URL',
    'OPENAI_MODEL',
  ];

  const missing = [];
  for (const key of required) {
    if (!process.env[key] || process.env[key] === '') {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(`缺少必要的环境变量: ${missing.join(', ')}`);
  }

  // 检查密码强度
  if (process.env.DB_PASSWORD && process.env.DB_PASSWORD.length < 8) {
    console.warn('警告：数据库密码过于简单，建议使用至少8位的密码');
  }

  // 检查 JWT_SECRET 强度
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    console.warn('警告：JWT_SECRET 过于简单，建议使用更长的密钥');
  }
}

// 生成安全的随机字符串
function generateSecureString(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

// 生成安全的密码哈希
async function generateSecurePasswordHash(password) {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
}

// 安全地写入 .env 文件
function secureWriteEnv(envData) {
  const envPath = path.join(__dirname, '../../.env');
  const content = Object.entries(envData)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  // 写入敏感配置时强制使用仅所有者可读写的权限。
  fs.writeFileSync(envPath, content, { encoding: 'utf-8', mode: 0o600 });
  try {
    fs.chmodSync(envPath, 0o600);
  } catch {
    // Windows 等平台可能不支持 POSIX 权限，写入本身不受影响。
  }

  // 设置环境变量到 process.env
  Object.entries(envData).forEach(([key, value]) => {
    process.env[key] = value;
  });

  return true;
}

// 读取并验证 .env 文件
function loadAndValidateEnv() {
  const envPath = path.join(__dirname, '../../.env');
  if (!fs.existsSync(envPath)) {
    throw new Error('.env 文件不存在');
  }

  require('dotenv').config({ path: envPath });
  checkEnvironmentVariables();
}

module.exports = {
  checkEnvironmentVariables,
  generateSecureString,
  generateSecurePasswordHash,
  secureWriteEnv,
  loadAndValidateEnv,
};
