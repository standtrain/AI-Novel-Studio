const { db } = require('../config/database');

const TABLE = 'site_config';

const configDao = {
  async getAll() {
    const rows = await db(TABLE).select('config_key', 'config_value', 'description');
    const config = {};
    rows.forEach(r => { config[r.config_key] = r.config_value; });
    return config;
  },

  async getAllDetailed() {
    return db(TABLE).select('*').orderBy('config_key');
  },

  async get(key) {
    const row = await db(TABLE).where('config_key', key).first();
    return row ? row.config_value : null;
  },

  async set(key, value) {
    await db.raw(
      `INSERT INTO ?? (config_key, config_value, updated_at) VALUES (?, ?, NOW())
       ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), updated_at = NOW()`,
      [TABLE, key, value]
    );
  },

  async getInt(key, defaultValue = 0) {
    const val = await this.get(key);
    return val !== null ? parseInt(val, 10) : defaultValue;
  },
};

module.exports = configDao;
