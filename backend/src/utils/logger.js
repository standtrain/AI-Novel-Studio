const pino = require('pino');

function createLogger(name) {
  return pino({
    name,
    transport: process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
      : undefined,
  });
}

module.exports = { createLogger };
