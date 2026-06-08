const { db } = require('../config/database');

const TABLE = 'user_temperature_config';

const userTemperatureDao = {
  /** 获取用户所有阶段温度配置 */
  async getByUserId(userId) {
    const rows = await db(TABLE).where('user_id', userId).select('phase', 'temperature');
    const config = {};
    for (const row of rows) {
      config[row.phase] = row.temperature;
    }
    return config;
  },

  /** 批量保存用户阶段温度配置（UPSERT） */
  async saveBatch(userId, configs) {
    const trx = await db.transaction();
    try {
      for (const [phase, temperature] of Object.entries(configs)) {
        if (temperature === null || temperature === undefined) {
          // null/undefined = 删除覆盖，使用系统默认
          await trx(TABLE).where({ user_id: userId, phase }).del();
        } else {
          await trx(TABLE)
            .insert({ user_id: userId, phase, temperature })
            .onConflict(['user_id', 'phase'])
            .merge(['temperature']);
        }
      }
      await trx.commit();
    } catch (err) {
      await trx.rollback();
      throw err;
    }
  },

  /** 删除用户所有温度配置 */
  async deleteByUserId(userId) {
    return db(TABLE).where('user_id', userId).del();
  },
};

module.exports = userTemperatureDao;
