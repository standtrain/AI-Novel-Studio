const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function getDbPassword() {
  return process.env.DB_PASSWORD || process.env.DB_PWD || '';
}

function checkEnvironmentVariables() {
  const required = [
    'DB_HOST',
    'DB_PORT',
    'DB_USER',
    'DB_NAME',
    'JWT_SECRET',
  ];

  const missing = [];
  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }
  if (!getDbPassword()) {
    missing.push('DB_PASSWORD or DB_PWD');
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const dbPassword = getDbPassword();
  if (dbPassword.length < 8) {
    console.warn('Warning: database password is shorter than 8 characters.');
  }

  if (process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long.');
  }
}

function generateSecureString(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

async function generateSecurePasswordHash(password) {
  const bcrypt = require('bcrypt');
  const saltRounds = 12;
  return bcrypt.hash(password, saltRounds);
}

function secureWriteEnv(envData) {
  const envPath = path.join(__dirname, '../../.env');
  const content = Object.entries(envData)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  fs.writeFileSync(envPath, content, { encoding: 'utf-8', mode: 0o600 });
  try {
    fs.chmodSync(envPath, 0o600);
  } catch {
    // Windows may not support POSIX file modes; writing still succeeds.
  }

  Object.entries(envData).forEach(([key, value]) => {
    process.env[key] = value;
  });

  return true;
}

function loadAndValidateEnv() {
  const envPath = path.join(__dirname, '../../.env');
  if (!fs.existsSync(envPath)) {
    throw new Error('.env file does not exist.');
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
