const { db } = require('../config/database');

const TABLE = 'inmails';

const inmailDao = {
  /** 创建单条站内信：用于工单回复等点对点通知 */
  async create(userId, { title, content, notification_id }) {
    const [id] = await db(TABLE).insert({
      user_id: userId,
      notification_id: notification_id || null,
      title,
      content,
    });
    return db(TABLE).where({ id }).first();
  },

  /** 获取用户站内信列表 */
  async listByUser(userId, { page = 1, limit = 20, unreadOnly = false } = {}) {
    const offset = (page - 1) * limit;
    let query = db(TABLE).where('user_id', userId);
    if (unreadOnly) query = query.where('is_read', false);
    const [{ total }] = await query.clone().count('* as total');
    const rows = await query
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);
    return { rows, total: parseInt(total, 10), page, limit };
  },

  /** 获取未读数量 */
  async getUnreadCount(userId) {
    const [{ count }] = await db(TABLE)
      .where('user_id', userId)
      .where('is_read', false)
      .count('* as count');
    return parseInt(count, 10);
  },

  /** 标记单条已读 */
  async markRead(id, userId) {
    return db(TABLE)
      .where('id', id)
      .where('user_id', userId)
      .update({ is_read: true, read_at: db.fn.now() });
  },

  /** 标记全部已读 */
  async markAllRead(userId) {
    return db(TABLE)
      .where('user_id', userId)
      .where('is_read', false)
      .update({ is_read: true, read_at: db.fn.now() });
  },

  /** 批量创建站内信（管理员发布通知时调用） */
  async batchCreate(userIds, { title, content, notification_id }) {
    if (!userIds.length) return 0;
    const rows = userIds.map((uid) => ({
      user_id: uid,
      notification_id: notification_id || null,
      title,
      content,
    }));
    // 分批插入，避免单次插入数据过大
    const chunkSize = 200;
    for (let i = 0; i < rows.length; i += chunkSize) {
      await db(TABLE).insert(rows.slice(i, i + chunkSize));
    }
    return rows.length;
  },
};

module.exports = inmailDao;
