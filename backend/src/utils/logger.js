const pino = require('pino');

function createLogger(name) {
  return pino({
    name,
    redact: {
      paths: [
        'authorization',
        'apiKey',
        'api_key',
        'password',
        'password_hash',
        'token',
        'JWT_SECRET',
        'OPENAI_API_KEY',
        'req.headers.authorization',
        'headers.authorization',
        '*.authorization',
        '*.apiKey',
        '*.api_key',
        '*.password',
        '*.password_hash',
        '*.token',
        '*.JWT_SECRET',
        '*.OPENAI_API_KEY',
      ],
      censor: '[已脱敏]',
    },
    transport: process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
      : undefined,
  });
}

module.exports = { createLogger };
