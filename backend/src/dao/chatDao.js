const { db } = require('../config/database');

const CONV_TABLE = 'chat_conversations';
const MSG_TABLE = 'chat_messages';

const chatDao = {
  // ========== 对话 ==========

  async listByUser(userId, { page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;
    const [rows, [{ total }]] = await Promise.all([
      db(CONV_TABLE)
        .select('id', 'title', 'created_at', 'updated_at')
        .where('user_id', userId)
        .orderBy('updated_at', 'desc')
        .limit(limit)
        .offset(offset),
      db(CONV_TABLE).where('user_id', userId).count('* as total'),
    ]);
    return { rows, total: parseInt(total, 10), page, limit };
  },

  async findById(id, userId) {
    return db(CONV_TABLE).where({ id, user_id: userId }).first();
  },

  async create(userId, title) {
    const [id] = await db(CONV_TABLE).insert({
      user_id: userId,
      title: title.substring(0, 200),
    });
    return id;
  },

  async updateTitle(id, userId, title) {
    return db(CONV_TABLE).where({ id, user_id: userId }).update({
      title: title.substring(0, 200),
      updated_at: db.fn.now(),
    });
  },

  async touch(id, userId) {
    return db(CONV_TABLE).where({ id, user_id: userId }).update({
      updated_at: db.fn.now(),
    });
  },

  async remove(id, userId) {
    return db(CONV_TABLE).where({ id, user_id: userId }).del();
  },

  async countByUser(userId) {
    const [{ total }] = await db(CONV_TABLE).where('user_id', userId).count('* as total');
    return parseInt(total, 10);
  },

  // ========== 消息 ==========

  async listMessages(conversationId) {
    return db(MSG_TABLE)
      .select('id', 'role', 'content', 'created_at')
      .where('conversation_id', conversationId)
      .orderBy('created_at', 'asc');
  },

  async addMessage(conversationId, role, content) {
    const [id] = await db(MSG_TABLE).insert({
      conversation_id: conversationId,
      role,
      content,
    });
    return id;
  },

  async deleteMessages(conversationId) {
    return db(MSG_TABLE).where('conversation_id', conversationId).del();
  },
};

module.exports = chatDao;