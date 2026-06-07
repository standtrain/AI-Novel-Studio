const { db } = require('../config/database');

const TABLE = 'novels';

const novelDao = {
  async findById(id) {
    return db(TABLE).where('id', id).first();
  },

  async findByUser(userId, { page = 1, limit = 10 } = {}) {
    const offset = (page - 1) * limit;
    const [rows, [{ total }]] = await Promise.all([
      db(TABLE)
        .select('id', 'user_id', 'title', 'genre', 'theme', 'status', 'current_step', 'chapter_count', 'created_at', 'updated_at')
        .where('user_id', userId)
        .orderBy('updated_at', 'desc')
        .limit(limit).offset(offset),
      db(TABLE).where('user_id', userId).count('* as total'),
    ]);
    return { rows, total: parseInt(total, 10), page, limit };
  },

  async findByUserId(userId, { limit = 100, status } = {}) {
    let query = db(TABLE)
      .select('id', 'user_id', 'title', 'genre', 'theme', 'status', 'current_step', 'chapter_count', 'created_at', 'updated_at')
      .where('user_id', userId)
      .orderBy('updated_at', 'desc')
      .limit(limit);
    if (status) {
      query = query.andWhere('status', status);
    }
    return query;
  },

  async create(data) {
    const [id] = await db(TABLE).insert(data);
    return id;
  },

  async update(id, data) {
    return db(TABLE).where('id', id).update(data);
  },

  async remove(id) {
    return db(TABLE).where('id', id).del();
  },

  async countByUser(userId) {
    const [{ total }] = await db(TABLE).where('user_id', userId).count('* as total');
    return parseInt(total, 10);
  },

  async updateContextData(id, contextData) {
    return db(TABLE).where('id', id).update({ context_data: JSON.stringify(contextData) });
  },

  async getTotalCount() {
    const [{ total }] = await db(TABLE).count('* as total');
    return parseInt(total, 10);
  },
};

module.exports = novelDao;
