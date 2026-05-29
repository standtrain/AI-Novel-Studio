const { db } = require('../config/database');
const TABLE = 'novel_templates';

const templateDao = {
  // ---- 公开列表（官方 + 已审核通过的用户模板） ----
  async getAllPublic() {
    return db(TABLE)
      .leftJoin('users', `${TABLE}.creator_id`, 'users.id')
      .where(`${TABLE}.enabled`, true)
      .where(function () {
        this.where(`${TABLE}.is_official`, true).orWhere(function () {
          this.where(`${TABLE}.is_official`, false).where(`${TABLE}.review_status`, 'approved');
        });
      })
      .orderBy(`${TABLE}.sort_order`, 'asc')
      .select(`${TABLE}.*`, 'users.username as creator_username');
  },

  // 获取分类列表（仅公开模板）
  async getPublicCategories() {
    const rows = await db(TABLE)
      .where('enabled', true)
      .where(function () {
        this.where('is_official', true).orWhere(function () {
          this.where('is_official', false).where('review_status', 'approved');
        });
      })
      .distinct('category')
      .orderBy('category', 'asc');
    return rows.map(r => r.category);
  },

  // 按分类获取公开模板
  async getPublicByCategory(category) {
    return db(TABLE)
      .leftJoin('users', `${TABLE}.creator_id`, 'users.id')
      .where({ [`${TABLE}.category`]: category, [`${TABLE}.enabled`]: true })
      .where(function () {
        this.where(`${TABLE}.is_official`, true).orWhere(function () {
          this.where(`${TABLE}.is_official`, false).where(`${TABLE}.review_status`, 'approved');
        });
      })
      .orderBy(`${TABLE}.sort_order`, 'asc')
      .select(`${TABLE}.*`, 'users.username as creator_username');
  },

  // ---- 用户自有模板 ----
  async getByCreator(userId) {
    return db(TABLE).where({ creator_id: userId }).orderBy('created_at', 'desc');
  },

  // ---- 基础 CRUD ----
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

  async incrementUsage(id) {
    return db(TABLE).where({ id }).increment('usage_count', 1);
  },

  // ---- 审核相关 ----
  async getPendingReviews() {
    return db(TABLE)
      .leftJoin('users', `${TABLE}.creator_id`, 'users.id')
      .where({ [`${TABLE}.review_status`]: 'pending', [`${TABLE}.enabled`]: true })
      .orderBy(`${TABLE}.created_at`, 'asc')
      .select(`${TABLE}.*`, 'users.username as creator_username');
  },

  async getAllForAdmin() {
    return db(TABLE)
      .leftJoin('users', `${TABLE}.creator_id`, 'users.id')
      .orderBy(`${TABLE}.sort_order`, 'asc')
      .select(`${TABLE}.*`, 'users.username as creator_username');
  },
};

module.exports = templateDao;
