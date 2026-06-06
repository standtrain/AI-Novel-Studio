const { db } = require('../config/database');

const TABLE = 'email_verifications';

const emailVerificationDao = {
  /** 创建验证码记录 */
  async create({ userId, email, code, type, newEmail }) {
    const [id] = await db(TABLE).insert({
      user_id: userId || null,
      email,
      code,
      type,
      new_email: newEmail || null,
      used: false,
      expires_at: db.raw("DATE_ADD(NOW(), INTERVAL 10 MINUTE)"),
    });
    return id;
  },

  /** 校验验证码 */
  async verify(email, code, type) {
    const row = await db(TABLE)
      .where({ email, code, type, used: false })
      .where('expires_at', '>', db.fn.now())
      .orderBy('created_at', 'desc')
      .first();
    return row || null;
  },

  /** 标记验证码为已使用 */
  async markUsed(id) {
    return db(TABLE).where('id', id).update({ used: true });
  },

  /** 清除邮箱未使用的验证码（防止重复发送） */
  async invalidatePrevious(email, type) {
    return db(TABLE)
      .where({ email, type, used: false })
      .update({ used: true });
  },

  /** 清除过期验证码（定时任务可用） */
  async cleanExpired() {
    return db(TABLE).where('expires_at', '<', db.fn.now()).where('used', false).del();
  },

  /** 获取指定邮箱特定类型的最近一条有效验证码 */
  async getLatestValid(email, type) {
    return db(TABLE)
      .where({ email, type, used: false })
      .where('expires_at', '>', db.fn.now())
      .orderBy('created_at', 'desc')
      .first();
  },
};

module.exports = emailVerificationDao;
