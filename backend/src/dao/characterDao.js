const { db } = require('../config/database');

const TABLE = 'characters';

const characterDao = {
  async findByNovelId(novelId) {
    return db(TABLE).where('novel_id', novelId).orderBy('id', 'asc');
  },

  async create(data) {
    const [id] = await db(TABLE).insert(data);
    return id;
  },

  async update(id, data) {
    return db(TABLE).where('id', id).update(data);
  },

  async deleteByNovelId(novelId) {
    return db(TABLE).where('novel_id', novelId).del();
  },

  async bulkCreate(characters) {
    if (!characters.length) return [];
    const ids = await db(TABLE).insert(characters);
    return Array.isArray(ids) ? ids : [ids];
  },
};

module.exports = characterDao;
