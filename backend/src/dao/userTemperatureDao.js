const { db } = require('../config/database');

const TABLE = 'user_temperature_configs';

const userTemperatureDao = {
  async getByUser(userId) {
    const rows = await db(TABLE)
      .select('phase', 'temperature')
      .where('user_id', userId);
    const configs = {};
    rows.forEach(row => {
      configs[row.phase] = Number(row.temperature);
    });
    return configs;
  },

  async replaceForUser(userId, configs) {
    await db.transaction(async trx => {
      await trx(TABLE).where('user_id', userId).del();
      const rows = Object.entries(configs)
        .filter(([, temperature]) => temperature !== null && temperature !== undefined)
        .map(([phase, temperature]) => ({
          user_id: userId,
          phase,
          temperature,
        }));
      if (rows.length > 0) {
        await trx(TABLE).insert(rows);
      }
    });
    return this.getByUser(userId);
  },

  async deleteAllForUser(userId) {
    return db(TABLE).where('user_id', userId).del();
  },
};

module.exports = userTemperatureDao;
