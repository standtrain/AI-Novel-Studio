const { db } = require('../config/database');

const TABLE = 'chapters';

const chapterDao = {
  async findByNovelId(novelId) {
    return db(TABLE).where('novel_id', novelId).orderBy('chapter_number', 'asc');
  },

  async findByNovelAndNumber(novelId, chapterNumber) {
    return db(TABLE)
      .where({ novel_id: novelId, chapter_number: chapterNumber })
      .first();
  },

  async create(data) {
    const [id] = await db(TABLE).insert(data);
    return id;
  },

  async update(novelId, chapterNumber, data) {
    const affectedRows = await db(TABLE)
      .where({ novel_id: novelId, chapter_number: chapterNumber })
      .update(data);
    if (affectedRows === 0) {
      throw Object.assign(new Error('章节不存在，更新失败'), { status: 404 });
    }
    return affectedRows;
  },

  async upsert(data) {
    const existing = await db(TABLE)
      .where({ novel_id: data.novel_id, chapter_number: data.chapter_number })
      .first();
    if (existing) {
      await db(TABLE).where('id', existing.id).update({ ...data, updated_at: db.fn.now() });
      return existing.id;
    }
    const [id] = await db(TABLE).insert({ ...data, created_at: db.fn.now(), updated_at: db.fn.now() });
    return id;
  },

  async deleteByNovelId(novelId) {
    return db(TABLE).where('novel_id', novelId).del();
  },

  async countByNovel(novelId) {
    const [{ total }] = await db(TABLE).where('novel_id', novelId).count('* as total');
    return parseInt(total, 10);
  },

  async countIncomplete(novelId) {
    const [{ total }] = await db(TABLE).where('novel_id', novelId).where('status', '!=', 'completed').count('* as total');
    return parseInt(total, 10);
  },

  async bulkCreate(chapters) {
    if (!chapters.length) return [];
    const ids = await db(TABLE).insert(chapters);
    return Array.isArray(ids) ? ids : [ids];
  },
};

module.exports = chapterDao;
