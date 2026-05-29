const { db } = require('../config/database');
const TABLE = 'template_categories';

const categoryDao = {
  async getAll() {
    return db(TABLE).where('enabled', true).orderBy('sort_order', 'asc');
  },

  async getNames() {
    const rows = await db(TABLE).where('enabled', true).orderBy('sort_order', 'asc');
    return rows.map(r => r.name);
  },

  async getById(id) {
    return db(TABLE).where({ id }).first();
  },

  async getByName(name) {
    return db(TABLE).where({ name }).first();
  },

  async create(data) {
    const [id] = await db(TABLE).insert(data);
    return id;
  },

  async update(id, data) {
    return db(TABLE).where({ id }).update(data);
  },

  async remove(id) {
    return db(TABLE).where({ id }).delete();
  },
};

module.exports = categoryDao;
