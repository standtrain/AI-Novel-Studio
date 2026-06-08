const { db } = require('../config/database');

const TABLE = 'user_temperature_config';
let ensureTablePromise = null;

async function ensureTemperatureTable() {
  if (ensureTablePromise) return ensureTablePromise;

  ensureTablePromise = (async () => {
    const exists = await db.schema.hasTable(TABLE);
    if (exists) return;

    await db.schema.createTable(TABLE, (table) => {
      table.increments('id').unsigned().primary();
      table.integer('user_id').unsigned().notNullable();
      table.string('phase', 50).notNullable();
      table.decimal('temperature', 3, 2).notNullable();
      table.timestamp('created_at').notNullable().defaultTo(db.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(db.fn.now());
      table.unique(['user_id', 'phase'], 'uk_user_phase');
      table.foreign('user_id', 'utc_user_id_fk').references('users.id').onDelete('CASCADE');
    });
  })().catch((err) => {
    ensureTablePromise = null;
    throw err;
  });

  return ensureTablePromise;
}

const userTemperatureDao = {
  async getByUserId(userId) {
    await ensureTemperatureTable();
    const rows = await db(TABLE).where('user_id', userId).select('phase', 'temperature');
    const config = {};
    for (const row of rows) {
      config[row.phase] = Number(row.temperature);
    }
    return config;
  },

  async saveBatch(userId, configs) {
    await ensureTemperatureTable();
    const trx = await db.transaction();
    try {
      for (const [phase, temperature] of Object.entries(configs)) {
        if (temperature === null || temperature === undefined) {
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

  async deleteByUserId(userId) {
    await ensureTemperatureTable();
    return db(TABLE).where('user_id', userId).del();
  },
};

module.exports = userTemperatureDao;
