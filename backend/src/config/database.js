const knexfile = require('../../knexfile');
const db = require('knex')(knexfile[process.env.NODE_ENV || 'development']);
const { createLogger } = require('../utils/logger');

const logger = createLogger('db');

async function testConnection() {
  try {
    await db.raw('SELECT 1');
    logger.info('MySQL 数据库连接成功');
    return true;
  } catch (err) {
    logger.error('MySQL 数据库连接失败：' + err.message);
    throw err;
  }
}

module.exports = { db, testConnection };
