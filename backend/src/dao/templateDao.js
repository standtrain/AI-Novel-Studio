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

  // 带搜索+筛选+分页的公开模板查询
  async searchPublic({ keyword, category, source, page = 1, limit = 24 } = {}) {
    let query = db(TABLE)
      .leftJoin('users', `${TABLE}.creator_id`, 'users.id')
      .where(`${TABLE}.enabled`, true)
      .where(function () {
        this.where(`${TABLE}.is_official`, true).orWhere(function () {
          this.where(`${TABLE}.is_official`, false).where(`${TABLE}.review_status`, 'approved');
        });
      });

    // 来源筛选
    if (source === 'official') {
      query = query.where(`${TABLE}.is_official`, true);
    } else if (source === 'community') {
      query = query.where(`${TABLE}.is_official`, false);
    }

    // 分类筛选
    if (category && category !== '全部') {
      query = query.where(`${TABLE}.category`, category);
    }

    // 关键词搜索（多字段模糊匹配）
    if (keyword && keyword.trim()) {
      const kw = `%${keyword.trim()}%`;
      query = query.where(function () {
        this.where(`${TABLE}.display_name`, 'like', kw)
          .orWhere(`${TABLE}.name`, 'like', kw)
          .orWhere(`${TABLE}.description`, 'like', kw)
          .orWhere(`${TABLE}.category`, 'like', kw)
          .orWhere(`${TABLE}.genre`, 'like', kw)
          .orWhere(`${TABLE}.title_example`, 'like', kw)
          .orWhere(`${TABLE}.theme`, 'like', kw)
          .orWhere(`${TABLE}.setting`, 'like', kw)
          .orWhere(`${TABLE}.main_plot`, 'like', kw)
          .orWhere('users.username', 'like', kw);
      });
    }

    // 总数
    const [{ count: total }] = await query.clone().count('* as count');
    const rows = await query
      .clone()
      .orderBy(`${TABLE}.sort_order`, 'asc')
      .offset((page - 1) * limit)
      .limit(limit)
      .select(`${TABLE}.*`, 'users.username as creator_username');

    return { rows, total: Number(total), page, limit };
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
